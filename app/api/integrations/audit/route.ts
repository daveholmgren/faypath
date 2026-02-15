import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import type { IntegrationAuditEvent } from "@/lib/types";

function clampLimit(value: string | null) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return 40;
  return Math.min(100, Math.max(5, Math.floor(parsed)));
}

export async function GET(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const directionValue = url.searchParams.get("direction");
  const statusValue = url.searchParams.get("status");
  const query = url.searchParams.get("q")?.trim();

  const direction =
    directionValue === "inbound" || directionValue === "outbound" ? directionValue : undefined;
  const status = statusValue ? statusValue.trim() : undefined;

  const events = await prisma.webhookEvent.findMany({
    where: {
      ...(direction ? { direction } : {}),
      ...(status ? { status } : {}),
      ...(query
        ? {
            OR: [
              { source: { contains: query } },
              { eventType: { contains: query } },
              { note: { contains: query } }
            ]
          }
        : {})
    },
    orderBy: { receivedAt: "desc" },
    take: limit
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    total: events.length,
    events: events.map(
      (event): IntegrationAuditEvent => ({
        id: event.id,
        direction: event.direction === "inbound" ? "inbound" : "outbound",
        source: event.source,
        eventType: event.eventType,
        status: event.status,
        httpStatus: event.httpStatus,
        abuseScore: event.abuseScore,
        blocked: event.blocked,
        note: event.note,
        deliveryUrl: event.deliveryUrl,
        receivedAt: event.receivedAt.toISOString(),
        processedAt: event.processedAt ? event.processedAt.toISOString() : null
      })
    )
  });
}
