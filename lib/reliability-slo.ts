import { prisma } from "@/lib/prisma";
import type { ReliabilitySloMetric, ReliabilitySloSnapshot } from "@/lib/types";

type Scope = "employer" | "admin";

function statusFromThreshold(value: number, warnAt: number, breachAt: number) {
  if (value >= breachAt) return "breach" as const;
  if (value >= warnAt) return "warning" as const;
  return "healthy" as const;
}

function inverseStatusFromThreshold(value: number, warnAt: number, breachAt: number) {
  if (value <= breachAt) return "breach" as const;
  if (value <= warnAt) return "warning" as const;
  return "healthy" as const;
}

export async function getReliabilitySloSnapshot(input: {
  scope: Scope;
  userId: string;
}): Promise<ReliabilitySloSnapshot> {
  const jobWhere = input.scope === "admin" ? {} : { createdById: input.userId };
  const jobs = await prisma.job.findMany({
    where: jobWhere,
    select: {
      id: true,
      createdAt: true
    }
  });

  const jobIds = jobs.map((job) => job.id);
  const [recentWebhooks, applications] = await Promise.all([
    prisma.webhookEvent.findMany({
      where: {
        direction: "outbound",
        receivedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      select: {
        status: true,
        receivedAt: true,
        processedAt: true
      }
    }),
    jobIds.length
      ? prisma.application.findMany({
          where: { jobId: { in: jobIds } },
          select: {
            jobId: true,
            appliedAt: true
          },
          orderBy: { appliedAt: "asc" }
        })
      : Promise.resolve([])
  ]);

  const webhookTotal = recentWebhooks.length;
  const webhookFailed = recentWebhooks.filter((item) => item.status === "failed").length;
  const failedWebhookRate = webhookTotal
    ? Number(((webhookFailed / webhookTotal) * 100).toFixed(2))
    : 0;

  const webhookLatenciesMs = recentWebhooks
    .map((item) =>
      item.processedAt ? item.processedAt.getTime() - item.receivedAt.getTime() : null
    )
    .filter((value): value is number => typeof value === "number" && value >= 0);

  const avgWebhookLatencyMs = webhookLatenciesMs.length
    ? Math.round(webhookLatenciesMs.reduce((sum, value) => sum + value, 0) / webhookLatenciesMs.length)
    : 0;

  const firstApplyByJob = new Map<number, Date>();
  for (const application of applications) {
    if (!firstApplyByJob.has(application.jobId)) {
      firstApplyByJob.set(application.jobId, application.appliedAt);
    }
  }

  const jobToFirstApplyHours = jobs
    .map((job) => {
      const firstApplyAt = firstApplyByJob.get(job.id);
      if (!firstApplyAt) return null;
      return (firstApplyAt.getTime() - job.createdAt.getTime()) / (1000 * 60 * 60);
    })
    .filter((value): value is number => typeof value === "number" && value >= 0);

  const avgJobToFirstApplyHours = jobToFirstApplyHours.length
    ? Number(
        (
          jobToFirstApplyHours.reduce((sum, value) => sum + value, 0) / jobToFirstApplyHours.length
        ).toFixed(2)
      )
    : 0;

  const applicationsPerJob = jobs.length ? applications.length / Math.max(1, jobs.length) : 0;

  const metrics: ReliabilitySloMetric[] = [
    {
      key: "failed_webhook_rate",
      label: "Failed webhook rate (24h)",
      objective: "Target <= 2.0%",
      value: failedWebhookRate,
      unit: "%",
      status: statusFromThreshold(failedWebhookRate, 1.25, 2.0),
      detail: `${webhookFailed} failed of ${webhookTotal} outbound webhook attempts in last 24h.`
    },
    {
      key: "delivery_latency",
      label: "Webhook delivery latency",
      objective: "Target <= 1200ms average",
      value: avgWebhookLatencyMs,
      unit: "ms",
      status: statusFromThreshold(avgWebhookLatencyMs, 800, 1200),
      detail: `Average outbound webhook processing latency over last 24h.`
    },
    {
      key: "job_to_first_apply",
      label: "Job-post-to-first-apply",
      objective: "Target <= 72 hours",
      value: avgJobToFirstApplyHours,
      unit: "hours",
      status: statusFromThreshold(avgJobToFirstApplyHours, 48, 72),
      detail: "Average hours between posting and first application for jobs in scope."
    },
    {
      key: "applications_health",
      label: "Application throughput signal",
      objective: "Target > 50% throughput baseline",
      value: Number((applicationsPerJob * 100).toFixed(2)),
      unit: "%",
      status: inverseStatusFromThreshold(applicationsPerJob, 0.8, 0.5),
      detail: "Applications-per-job health converted to percentage (higher is healthier)."
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    scope: input.scope,
    metrics
  };
}
