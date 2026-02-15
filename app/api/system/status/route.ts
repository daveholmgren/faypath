import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import type { SystemStatusCheck, SystemStatusSnapshot } from "@/lib/types";

function envValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function authSecretCheck(): SystemStatusCheck {
  const secret = envValue("AUTH_SECRET");
  if (!secret || secret === "replace-with-a-long-random-secret") {
    return {
      key: "auth_secret",
      label: "Auth secret",
      status: "fail",
      detail: "AUTH_SECRET is missing or still using the placeholder value."
    };
  }

  return {
    key: "auth_secret",
    label: "Auth secret",
    status: "pass",
    detail: "AUTH_SECRET is configured."
  };
}

function emailProviderCheck(): SystemStatusCheck {
  const provider = (envValue("EMAIL_PROVIDER") || "log").toLowerCase();
  const hasResendKey = !!envValue("RESEND_API_KEY");

  if (provider === "resend" && !hasResendKey) {
    return {
      key: "email_provider",
      label: "Email provider",
      status: "fail",
      detail: "EMAIL_PROVIDER is resend but RESEND_API_KEY is missing."
    };
  }

  if (provider === "log") {
    return {
      key: "email_provider",
      label: "Email provider",
      status: "warn",
      detail: "Using log provider only; emails are not sent to real inboxes."
    };
  }

  return {
    key: "email_provider",
    label: "Email provider",
    status: "pass",
    detail: `Email provider is configured as ${provider}.`
  };
}

function webhookOutboundCheck(): SystemStatusCheck {
  const url = envValue("WEBHOOK_OUTBOUND_URL");
  if (!url) {
    return {
      key: "webhook_outbound",
      label: "Outbound webhook",
      status: "warn",
      detail: "WEBHOOK_OUTBOUND_URL is not configured."
    };
  }

  return {
    key: "webhook_outbound",
    label: "Outbound webhook",
    status: "pass",
    detail: "Outbound webhook URL is configured."
  };
}

function webhookSecretCheck(): SystemStatusCheck {
  const shared = envValue("WEBHOOK_SHARED_SECRET");
  const inbound = envValue("WEBHOOK_INBOUND_SECRET");
  if (!shared && !inbound) {
    return {
      key: "webhook_secret",
      label: "Webhook signature secret",
      status: "warn",
      detail: "No webhook signing secret configured."
    };
  }

  return {
    key: "webhook_secret",
    label: "Webhook signature secret",
    status: "pass",
    detail: "Webhook signing secret is configured."
  };
}

function pushProviderCheck(): SystemStatusCheck {
  const provider = (envValue("PUSH_PROVIDER") || "log").toLowerCase();
  if (provider !== "log" && provider !== "webhook") {
    return {
      key: "push_provider",
      label: "Push provider",
      status: "warn",
      detail: `PUSH_PROVIDER=${provider} is unknown.`
    };
  }

  if (provider === "webhook") {
    const endpoint = envValue("PUSH_WEBHOOK_URL");
    if (!endpoint) {
      return {
        key: "push_provider",
        label: "Push provider",
        status: "fail",
        detail: "PUSH_PROVIDER is webhook but PUSH_WEBHOOK_URL is missing."
      };
    }
    return {
      key: "push_provider",
      label: "Push provider",
      status: "pass",
      detail: "Webhook push provider is configured."
    };
  }

  return {
    key: "push_provider",
    label: "Push provider",
    status: "warn",
    detail: "Using log push provider; notifications are not sent to devices."
  };
}

function externalIngestTokenCheck(): SystemStatusCheck {
  const token = envValue("EXTERNAL_INGEST_TOKEN");
  if (!token) {
    return {
      key: "external_ingest_token",
      label: "External ingest token",
      status: "warn",
      detail: "EXTERNAL_INGEST_TOKEN is not configured for feed-based imports."
    };
  }

  return {
    key: "external_ingest_token",
    label: "External ingest token",
    status: "pass",
    detail: "External ingest token is configured."
  };
}

function overallStatusForChecks(checks: SystemStatusCheck[]): SystemStatusSnapshot["overallStatus"] {
  if (checks.some((check) => check.status === "fail")) return "degraded";
  if (checks.some((check) => check.status === "warn")) return "warning";
  return "ready";
}

export async function GET() {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const isEmployer = session.user.role === "EMPLOYER";
  const isAdmin = session.user.role === "ADMIN";
  if (!isEmployer && !isAdmin) {
    return NextResponse.json({ error: "Employer access required" }, { status: 403 });
  }

  let dbConnected = true;
  let counts: SystemStatusSnapshot["counts"] = {
    users: 0,
    jobs: 0,
    applications: 0,
    pendingAlerts: 0,
    webhookEvents: 0,
    fraudEvents: 0,
    securityBacklogItems: 0
  };

  try {
    const [users, jobs, applications, pendingAlerts, webhookEvents, fraudEvents, securityBacklogItems] =
      await Promise.all([
      prisma.user.count(),
      prisma.job.count(),
      prisma.application.count(),
      prisma.jobAlert.count({ where: { emailSentAt: null } }),
      prisma.webhookEvent.count(),
      prisma.fraudEvent.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }),
      prisma.securityBacklogItem.count({
        where: {
          status: {
            notIn: ["done", "closed"]
          }
        }
      })
    ]);
    counts = {
      users,
      jobs,
      applications,
      pendingAlerts,
      webhookEvents,
      fraudEvents,
      securityBacklogItems
    };
  } catch (error) {
    dbConnected = false;
    console.error(
      `[system-status] database health check failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  const checks: SystemStatusCheck[] = [
    {
      key: "database",
      label: "Database connectivity",
      status: dbConnected ? "pass" : "fail",
      detail: dbConnected ? "Database queries are succeeding." : "Database queries are failing."
    },
    authSecretCheck(),
    emailProviderCheck(),
    pushProviderCheck(),
    webhookOutboundCheck(),
    webhookSecretCheck(),
    externalIngestTokenCheck()
  ];

  const snapshot: SystemStatusSnapshot = {
    generatedAt: new Date().toISOString(),
    overallStatus: overallStatusForChecks(checks),
    checks,
    counts
  };

  return NextResponse.json(snapshot);
}
