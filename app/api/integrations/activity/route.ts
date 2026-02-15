import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import type { IntegrationActivity } from "@/lib/types";

type ScopeMode = "self" | "all";

const emptyActivity: IntegrationActivity = {
  scope: "none",
  generatedAt: new Date(0).toISOString(),
  deliveries: {
    total: 0,
    accepted: 0,
    failed: 0,
    recent: []
  },
  webhooks: {
    total: 0,
    delivered: 0,
    failed: 0,
    blocked: 0,
    recent: []
  }
};

function parseScope(value: string | null | undefined): ScopeMode {
  return value === "all" ? "all" : "self";
}

export async function GET(req: Request) {
  await ensureSeedData();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(emptyActivity);
  }

  const isEmployer = session.user.role === "EMPLOYER";
  const isAdmin = session.user.role === "ADMIN";
  if (!isEmployer && !isAdmin) {
    return NextResponse.json(emptyActivity);
  }

  const url = new URL(req.url);
  const scope = parseScope(url.searchParams.get("scope"));
  if (scope === "all" && !isAdmin) {
    return NextResponse.json({ error: "Admin access required for scope=all" }, { status: 403 });
  }

  const analyticsScope: IntegrationActivity["scope"] =
    scope === "all" || isAdmin ? "admin" : "employer";
  const userFilter = scope === "all" ? undefined : session.user.id;

  const [deliveryTotal, deliveryAccepted, deliveryFailed, recentDeliveries] = await Promise.all([
    prisma.alertDeliveryLog.count({
      where: userFilter ? { userId: userFilter } : undefined
    }),
    prisma.alertDeliveryLog.count({
      where: {
        ...(userFilter ? { userId: userFilter } : {}),
        accepted: true
      }
    }),
    prisma.alertDeliveryLog.count({
      where: {
        ...(userFilter ? { userId: userFilter } : {}),
        accepted: false
      }
    }),
    prisma.alertDeliveryLog.findMany({
      where: userFilter ? { userId: userFilter } : undefined,
      orderBy: { deliveredAt: "desc" },
      take: 8,
      select: {
        id: true,
        kind: true,
        recipient: true,
        subject: true,
        provider: true,
        accepted: true,
        channel: true,
        deliveredAt: true
      }
    })
  ]);

  const webhookWhere =
    analyticsScope === "admin" ? {} : { direction: "outbound", source: { startsWith: "faypath" } };
  const [webhookTotal, webhookDelivered, webhookFailed, webhookBlocked, recentWebhooks] = await Promise.all([
    prisma.webhookEvent.count({ where: webhookWhere }),
    prisma.webhookEvent.count({
      where: {
        ...webhookWhere,
        status: "delivered"
      }
    }),
    prisma.webhookEvent.count({
      where: {
        ...webhookWhere,
        status: "failed"
      }
    }),
    prisma.webhookEvent.count({
      where: {
        ...webhookWhere,
        blocked: true
      }
    }),
    prisma.webhookEvent.findMany({
      where: webhookWhere,
      orderBy: { receivedAt: "desc" },
      take: 8,
      select: {
        id: true,
        direction: true,
        source: true,
        eventType: true,
        status: true,
        httpStatus: true,
        abuseScore: true,
        blocked: true,
        receivedAt: true,
        processedAt: true
      }
    })
  ]);

  return NextResponse.json({
    scope: analyticsScope,
    generatedAt: new Date().toISOString(),
    deliveries: {
      total: deliveryTotal,
      accepted: deliveryAccepted,
      failed: deliveryFailed,
      recent: recentDeliveries.map((record) => ({
        id: record.id,
        kind: record.kind === "digest" ? "digest" : "instant",
        recipient: record.recipient,
        subject: record.subject,
        provider: record.provider,
        accepted: record.accepted,
        channel:
          record.channel === "push"
            ? "push"
            : record.channel === "in_app"
              ? "in_app"
              : "email",
        deliveredAt: record.deliveredAt.toISOString()
      }))
    },
    webhooks: {
      total: webhookTotal,
      delivered: webhookDelivered,
      failed: webhookFailed,
      blocked: webhookBlocked,
      recent: recentWebhooks.map((record) => ({
        id: record.id,
        direction: record.direction === "inbound" ? "inbound" : "outbound",
        source: record.source,
        eventType: record.eventType,
        status: record.status,
        httpStatus: record.httpStatus,
        abuseScore: record.abuseScore,
        blocked: record.blocked,
        receivedAt: record.receivedAt.toISOString(),
        processedAt: record.processedAt ? record.processedAt.toISOString() : null
      }))
    }
  } satisfies IntegrationActivity);
}
