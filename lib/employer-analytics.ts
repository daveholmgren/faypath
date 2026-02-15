import { prisma } from "@/lib/prisma";
import type { EmployerAnalytics } from "@/lib/types";

type AnalyticsScope = "employer" | "admin";

const baseEmptyAnalytics: Omit<EmployerAnalytics, "scope"> = {
  advancedEnabled: false,
  paywallReason: "Upgrade to unlock advanced analytics.",
  totalJobs: 0,
  totalApplications: 0,
  avgMeritFit: 0,
  shortlistCount: 0,
  interviewsScheduled: 0,
  sponsoredJobs: 0,
  featuredEmployers: 0,
  statusBreakdown: [],
  topRoles: []
};

export async function getEmployerAnalytics(input: {
  scope: AnalyticsScope;
  userId: string;
}): Promise<EmployerAnalytics> {
  const owner =
    input.scope === "admin"
      ? null
      : await prisma.user.findUnique({
          where: { id: input.userId },
          select: {
            billingPlan: true
          }
        });
  const advancedEnabled =
    input.scope === "admin" || (owner?.billingPlan ?? "free") !== "free";

  const jobs = await prisma.job.findMany({
    where: input.scope === "admin" ? {} : { createdById: input.userId },
    select: {
      id: true,
      title: true,
      company: true,
      meritFit: true,
      sponsored: true,
      featuredEmployer: true
    },
    orderBy: { createdAt: "desc" }
  });

  if (!jobs.length) {
    return {
      scope: input.scope,
      ...baseEmptyAnalytics,
      advancedEnabled,
      paywallReason: advancedEnabled ? null : "Upgrade to Pro to unlock advanced analytics."
    };
  }

  const jobIds = jobs.map((job) => job.id);
  const [applications, shortlistCount, interviewsScheduled] = await Promise.all([
    prisma.application.findMany({
      where: {
        jobId: { in: jobIds }
      },
      select: {
        jobId: true,
        status: true,
        autoRankScore: true
      }
    }),
    prisma.shortlistEntry.count({
      where: input.scope === "admin" ? {} : { employerId: input.userId }
    }),
    prisma.interview.count()
  ]);

  const totalApplications = applications.length;
  const meritTotal = jobs.reduce((sum, job) => sum + job.meritFit, 0);
  const avgMeritFit = Math.round((meritTotal / jobs.length) * 10) / 10;
  const sponsoredJobs = jobs.filter((job) => job.sponsored).length;
  const featuredEmployers = new Set(
    jobs.filter((job) => job.featuredEmployer).map((job) => job.company)
  ).size;

  const statusCounts = new Map<string, number>();
  const appCountsByJob = new Map<number, number>();
  const rankTotalsByJob = new Map<number, number>();

  for (const application of applications) {
    statusCounts.set(application.status, (statusCounts.get(application.status) ?? 0) + 1);
    appCountsByJob.set(application.jobId, (appCountsByJob.get(application.jobId) ?? 0) + 1);
    rankTotalsByJob.set(
      application.jobId,
      (rankTotalsByJob.get(application.jobId) ?? 0) + application.autoRankScore
    );
  }

  const statusBreakdown = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const topRoles = jobs
    .map((job) => ({
      jobId: job.id,
      title: job.title,
      company: job.company,
      applications: appCountsByJob.get(job.id) ?? 0,
      meritFit: job.meritFit,
      avgRankScore: appCountsByJob.get(job.id)
        ? Math.round((rankTotalsByJob.get(job.id) ?? 0) / (appCountsByJob.get(job.id) ?? 1))
        : 0
    }))
    .sort((a, b) => b.applications - a.applications || b.meritFit - a.meritFit)
    .slice(0, 3);

  return {
    scope: input.scope,
    advancedEnabled,
    paywallReason: advancedEnabled ? null : "Upgrade to Pro to unlock advanced analytics.",
    totalJobs: jobs.length,
    totalApplications,
    avgMeritFit,
    shortlistCount,
    interviewsScheduled,
    sponsoredJobs,
    featuredEmployers,
    statusBreakdown: advancedEnabled ? statusBreakdown : [],
    topRoles: advancedEnabled ? topRoles : []
  };
}
