import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { retryFailedWebhookEvents } from "@/lib/integrations/events";
import { consumeRateLimit, rateLimitHeaders, type RateLimitResult } from "@/lib/rate-limit";

function jsonWithThrottle(body: unknown, throttle: RateLimitResult, status = 200) {
  const response = NextResponse.json(body, { status });
  const headers = rateLimitHeaders(throttle);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function GET() {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const throttle = consumeRateLimit({
    namespace: "integrations:retry:get",
    identifier: session.user.id,
    limit: 30,
    windowMs: 60_000
  });
  if (!throttle.allowed) {
    return jsonWithThrottle({ error: "Too many retry status requests." }, throttle, 429);
  }

  const [failed, skipped] = await Promise.all([
    prisma.webhookEvent.count({
      where: {
        direction: "outbound",
        status: "failed"
      }
    }),
    prisma.webhookEvent.count({
      where: {
        direction: "outbound",
        status: "skipped"
      }
    })
  ]);

  return jsonWithThrottle(
    {
      failed,
      skipped,
      retryable: failed + skipped
    },
    throttle
  );
}

export async function POST(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const throttle = consumeRateLimit({
    namespace: "integrations:retry:post",
    identifier: session.user.id,
    limit: 8,
    windowMs: 60_000
  });
  if (!throttle.allowed) {
    return jsonWithThrottle({ error: "Too many retry requests. Slow down." }, throttle, 429);
  }

  const body = (await req.json().catch(() => ({}))) as {
    limit?: number;
    ids?: number[];
  };

  const result = await retryFailedWebhookEvents({
    limit: typeof body.limit === "number" ? body.limit : 10,
    ids: Array.isArray(body.ids) ? body.ids : undefined
  });

  return jsonWithThrottle(result, throttle);
}
