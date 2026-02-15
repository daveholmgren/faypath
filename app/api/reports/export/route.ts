import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { getAlertDeliveryPreview } from "@/lib/alert-delivery";
import { getEmployerAnalytics } from "@/lib/employer-analytics";
import { getPipelineAutomationSnapshot } from "@/lib/pipeline-automation";

type ScopeMode = "self" | "all";
type ExportFormat = "json" | "csv";
type ExportResource = "summary" | "deliveries" | "webhooks";

function parseScope(value: string | null | undefined): ScopeMode {
  return value === "all" ? "all" : "self";
}

function parseFormat(value: string | null | undefined): ExportFormat {
  return value === "csv" ? "csv" : "json";
}

function parseResource(value: string | null | undefined): ExportResource {
  if (value === "deliveries" || value === "webhooks") return value;
  return "summary";
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value);
  const escaped = text.replaceAll('"', '""');
  return `"${escaped}"`;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(csvCell).join(",");
  const lines = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return [headerLine, ...lines].join("\n");
}

export async function GET(req: Request) {
  await ensureSeedData();
  const session = await auth();

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const isEmployer = session.user.role === "EMPLOYER";
  const isAdmin = session.user.role === "ADMIN";
  if (!isEmployer && !isAdmin) {
    return new Response(JSON.stringify({ error: "Employer access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  const url = new URL(req.url);
  const scope = parseScope(url.searchParams.get("scope"));
  const format = parseFormat(url.searchParams.get("format"));
  const resource = parseResource(url.searchParams.get("resource"));

  if (scope === "all" && !isAdmin) {
    return new Response(JSON.stringify({ error: "Admin access required for scope=all" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (resource === "webhooks" && !isAdmin) {
    return new Response(JSON.stringify({ error: "Admin access required for webhook exports" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  const analyticsScope = scope === "all" || isAdmin ? "admin" : "employer";
  const deliveryScope = scope === "all" ? "all" : "self";
  const userIdFilter = scope === "all" ? undefined : session.user.id;
  const timestamp = new Date().toISOString().replaceAll(":", "-");

  if (resource === "summary") {
    const [analytics, pipeline, deliveryPreview] = await Promise.all([
      getEmployerAnalytics({
        scope: analyticsScope,
        userId: session.user.id
      }),
      getPipelineAutomationSnapshot({
        scope: analyticsScope,
        userId: session.user.id
      }),
      getAlertDeliveryPreview({
        scope: deliveryScope,
        userId: userIdFilter
      })
    ]);

    const summary = {
      generatedAt: new Date().toISOString(),
      scope: analyticsScope,
      analytics,
      pipeline,
      deliveryPreview
    };

    if (format === "json") {
      return new Response(JSON.stringify(summary, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="faypath-report-summary-${timestamp}.json"`
        }
      });
    }

    const rows: Record<string, unknown>[] = [
      {
        generatedAt: summary.generatedAt,
        scope: summary.scope,
        totalJobs: analytics.totalJobs,
        totalApplications: analytics.totalApplications,
        avgMeritFit: analytics.avgMeritFit,
        shortlistCount: analytics.shortlistCount,
        interviewsScheduled: analytics.interviewsScheduled,
        sponsoredJobs: analytics.sponsoredJobs,
        featuredEmployers: analytics.featuredEmployers,
        advancedEnabled: analytics.advancedEnabled,
        pipelineApplications: pipeline.totals.applications,
        pipelineRecommendations: pipeline.totals.recommendations,
        pipelineScheduledInterviews: pipeline.totals.scheduledInterviews,
        pendingAlerts: deliveryPreview.pendingAlerts,
        pendingInstantAlerts: deliveryPreview.pendingInstantAlerts,
        dueDigestSearches: deliveryPreview.dueDigestSearches,
        waitingDigestSearches: deliveryPreview.waitingDigestSearches
      }
    ];

    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="faypath-report-summary-${timestamp}.csv"`
      }
    });
  }

  if (resource === "deliveries") {
    const records = await prisma.alertDeliveryLog.findMany({
      where: userIdFilter ? { userId: userIdFilter } : undefined,
      orderBy: { deliveredAt: "desc" },
      take: 500
    });

    if (format === "json") {
      return new Response(JSON.stringify(records, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="faypath-deliveries-${timestamp}.json"`
        }
      });
    }

    const rows: Record<string, unknown>[] = records.map((record) => ({
      id: record.id,
      userId: record.userId,
      alertId: record.alertId,
      savedSearchId: record.savedSearchId,
      channel: record.channel,
      kind: record.kind,
      provider: record.provider,
      providerMessageId: record.providerMessageId,
      accepted: record.accepted,
      recipient: record.recipient,
      subject: record.subject,
      deliveredAt: record.deliveredAt.toISOString()
    }));

    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="faypath-deliveries-${timestamp}.csv"`
      }
    });
  }

  const events = await prisma.webhookEvent.findMany({
    orderBy: { receivedAt: "desc" },
    take: 500
  });

  if (format === "json") {
    return new Response(JSON.stringify(events, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="faypath-webhooks-${timestamp}.json"`
      }
    });
  }

  const rows: Record<string, unknown>[] = events.map((event) => ({
    id: event.id,
    direction: event.direction,
    source: event.source,
    eventType: event.eventType,
    status: event.status,
    httpStatus: event.httpStatus,
    signatureValid: event.signatureValid,
    receivedAt: event.receivedAt.toISOString(),
    processedAt: event.processedAt ? event.processedAt.toISOString() : null,
    deliveryUrl: event.deliveryUrl,
    note: event.note
  }));

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="faypath-webhooks-${timestamp}.csv"`
    }
  });
}
