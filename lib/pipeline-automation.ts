import { prisma } from "@/lib/prisma";
import type {
  Application,
  InterviewRebalanceSuggestion,
  InterviewLoadStat,
  PipelineAutomationRunResult,
  PipelineAutomationSnapshot,
  PipelineStageRecommendation
} from "@/lib/types";

type PipelineScope = "employer" | "admin";
type AppStatus = Application["status"];

const validStatuses: AppStatus[] = ["Applied", "Interview", "Offer", "Rejected"];

function toAppStatus(value: string): AppStatus {
  return validStatuses.includes(value as AppStatus) ? (value as AppStatus) : "Applied";
}

function ageInDays(value: Date, now: Date) {
  return (now.getTime() - value.getTime()) / (1000 * 60 * 60 * 24);
}

function priorityRank(priority: PipelineStageRecommendation["priority"]) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function deriveRecommendation(input: {
  currentStatus: AppStatus;
  appliedAt: Date;
  meritFit: number;
}): {
  recommendedStatus: AppStatus;
  priority: PipelineStageRecommendation["priority"];
  confidence: number;
  reason: string;
} | null {
  const now = new Date();
  const days = ageInDays(input.appliedAt, now);
  const merit = input.meritFit;

  if (input.currentStatus === "Applied") {
    if (merit >= 90) {
      return {
        recommendedStatus: "Interview",
        priority: "high",
        confidence: 0.92,
        reason: "Top merit fit cleared threshold for immediate interview."
      };
    }

    if (merit >= 82 && days >= 4) {
      return {
        recommendedStatus: "Interview",
        priority: "medium",
        confidence: 0.81,
        reason: "Strong fit with enough pipeline age to move forward."
      };
    }

    if (merit < 70 && days >= 12) {
      return {
        recommendedStatus: "Rejected",
        priority: "medium",
        confidence: 0.76,
        reason: "Low fit and stale application beyond review window."
      };
    }
  }

  if (input.currentStatus === "Interview") {
    if (merit >= 88 && days >= 10) {
      return {
        recommendedStatus: "Offer",
        priority: "high",
        confidence: 0.87,
        reason: "Interview-stage candidate has high fit and long dwell time."
      };
    }

    if (merit < 75 && days >= 21) {
      return {
        recommendedStatus: "Rejected",
        priority: "low",
        confidence: 0.68,
        reason: "Interview-stage candidate is stale with below-target fit."
      };
    }
  }

  return null;
}

export async function getPipelineAutomationSnapshot(input: {
  scope: PipelineScope;
  userId: string;
}): Promise<PipelineAutomationSnapshot> {
  const now = new Date();
  const jobWhere = input.scope === "admin" ? {} : { createdById: input.userId };

  const jobs = await prisma.job.findMany({
    where: jobWhere,
    select: {
      id: true,
      title: true,
      company: true,
      meritFit: true
    }
  });

  if (!jobs.length) {
    return {
      scope: input.scope,
      generatedAt: now.toISOString(),
      totals: {
        applications: 0,
        recommendations: 0,
        scheduledInterviews: 0
      },
      recommendations: [],
      loadStats: [],
      rebalanceSuggestions: []
    };
  }

  const jobIds = jobs.map((job) => job.id);
  const [applications, upcomingInterviews] = await Promise.all([
    prisma.application.findMany({
      where: {
        jobId: { in: jobIds }
      },
      include: {
        user: {
          select: { email: true }
        },
        job: {
          select: {
            id: true,
            title: true,
            company: true,
            meritFit: true
          }
        }
      },
      orderBy: { appliedAt: "asc" }
    }),
    prisma.interview.findMany({
      where: {
        time: { gte: now }
      },
      orderBy: { time: "asc" },
      select: {
        id: true,
        person: true,
        owner: true,
        time: true
      }
    })
  ]);

  const recommendations: PipelineStageRecommendation[] = [];
  for (const application of applications) {
    const currentStatus = toAppStatus(application.status);
    const recommendation = deriveRecommendation({
      currentStatus,
      appliedAt: application.appliedAt,
      meritFit: application.job.meritFit
    });

    if (!recommendation || recommendation.recommendedStatus === currentStatus) continue;

    recommendations.push({
      applicationId: application.id,
      jobId: application.job.id,
      jobTitle: application.job.title,
      company: application.job.company,
      candidateEmail: application.user.email,
      currentStatus,
      recommendedStatus: recommendation.recommendedStatus,
      priority: recommendation.priority,
      confidence: recommendation.confidence,
      reason: recommendation.reason,
      appliedAt: application.appliedAt.toISOString()
    });
  }

  recommendations.sort((a, b) => {
    const priorityDiff = priorityRank(b.priority) - priorityRank(a.priority);
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });

  const interviewsByOwner = new Map<string, { scheduled: number; nextInterviewAt: Date | null }>();
  for (const interview of upcomingInterviews) {
    const existing = interviewsByOwner.get(interview.owner);
    if (!existing) {
      interviewsByOwner.set(interview.owner, {
        scheduled: 1,
        nextInterviewAt: interview.time
      });
      continue;
    }

    existing.scheduled += 1;
    if (!existing.nextInterviewAt || interview.time < existing.nextInterviewAt) {
      existing.nextInterviewAt = interview.time;
    }
  }

  const loadEntries = Array.from(interviewsByOwner.entries()).map(([owner, values]) => ({
    owner,
    scheduled: values.scheduled,
    nextInterviewAt: values.nextInterviewAt
  }));

  const totalInterviews = loadEntries.reduce((sum, entry) => sum + entry.scheduled, 0);
  const avgLoad = loadEntries.length ? totalInterviews / loadEntries.length : 0;

  const loadStats: InterviewLoadStat[] = loadEntries
    .map((entry) => {
      const loadLevel: InterviewLoadStat["loadLevel"] =
        entry.scheduled >= avgLoad + 1
          ? "high"
          : entry.scheduled <= avgLoad - 1
            ? "low"
            : "balanced";

      return {
        owner: entry.owner,
        scheduled: entry.scheduled,
        nextInterviewAt: entry.nextInterviewAt ? entry.nextInterviewAt.toISOString() : null,
        loadLevel
      };
    })
    .sort((a, b) => b.scheduled - a.scheduled);

  const virtualCounts = new Map(loadStats.map((entry) => [entry.owner, entry.scheduled]));
  const overloadedOwners = loadStats.filter((entry) => entry.loadLevel === "high").map((entry) => entry.owner);
  const underloadedOwners = loadStats.filter((entry) => entry.loadLevel === "low").map((entry) => entry.owner);

  const availableInterviewsByOwner = new Map<string, typeof upcomingInterviews>();
  for (const owner of overloadedOwners) {
    availableInterviewsByOwner.set(
      owner,
      upcomingInterviews.filter((interview) => interview.owner === owner).slice()
    );
  }

  const rebalanceSuggestions: InterviewRebalanceSuggestion[] = [];
  for (const overloadedOwner of overloadedOwners) {
    while (underloadedOwners.length) {
      const pool = availableInterviewsByOwner.get(overloadedOwner);
      const nextInterview = pool?.shift();
      if (!nextInterview) break;

      underloadedOwners.sort((a, b) => (virtualCounts.get(a) ?? 0) - (virtualCounts.get(b) ?? 0));
      const targetOwner = underloadedOwners[0];
      const sourceCount = virtualCounts.get(overloadedOwner) ?? 0;
      const targetCount = virtualCounts.get(targetOwner) ?? 0;

      if (sourceCount - targetCount <= 1) break;

      virtualCounts.set(overloadedOwner, sourceCount - 1);
      virtualCounts.set(targetOwner, targetCount + 1);

      rebalanceSuggestions.push({
        interviewId: nextInterview.id,
        person: nextInterview.person,
        currentOwner: overloadedOwner,
        suggestedOwner: targetOwner,
        time: nextInterview.time.toISOString(),
        reason: `Reduce interviewer load from ${sourceCount} to ${sourceCount - 1}, and raise ${targetOwner} from ${targetCount} to ${targetCount + 1}.`
      });
    }
  }

  return {
    scope: input.scope,
    generatedAt: now.toISOString(),
    totals: {
      applications: applications.length,
      recommendations: recommendations.length,
      scheduledInterviews: upcomingInterviews.length
    },
    recommendations,
    loadStats,
    rebalanceSuggestions
  };
}

export async function runPipelineAutomation(input: {
  scope: PipelineScope;
  userId: string;
  applyLimit?: number;
  rebalanceLimit?: number;
}): Promise<PipelineAutomationRunResult> {
  const now = new Date();
  const snapshot = await getPipelineAutomationSnapshot({
    scope: input.scope,
    userId: input.userId
  });

  const applyLimit = Number.isFinite(input.applyLimit) ? Math.max(0, Math.floor(input.applyLimit ?? 0)) : 3;
  const rebalanceLimit = Number.isFinite(input.rebalanceLimit)
    ? Math.max(0, Math.floor(input.rebalanceLimit ?? 0))
    : 2;

  const recommendationTargets = snapshot.recommendations.slice(0, applyLimit);
  const rebalanceTargets = snapshot.rebalanceSuggestions.slice(0, rebalanceLimit);

  let appliedStatusUpdates = 0;
  let movedInterviews = 0;

  for (const recommendation of recommendationTargets) {
    const result = await prisma.application.updateMany({
      where: {
        id: recommendation.applicationId,
        status: recommendation.currentStatus
      },
      data: {
        status: recommendation.recommendedStatus
      }
    });
    appliedStatusUpdates += result.count;
  }

  for (const suggestion of rebalanceTargets) {
    const result = await prisma.interview.updateMany({
      where: {
        id: suggestion.interviewId,
        owner: suggestion.currentOwner
      },
      data: {
        owner: suggestion.suggestedOwner
      }
    });
    movedInterviews += result.count;
  }

  return {
    scope: input.scope,
    runAt: now.toISOString(),
    recommendationsConsidered: recommendationTargets.length,
    rebalanceConsidered: rebalanceTargets.length,
    appliedStatusUpdates,
    movedInterviews
  };
}
