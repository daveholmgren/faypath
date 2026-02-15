import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { verifyIntegrationSignature } from "@/lib/integrations/events";
import {
  clientIdentifierFromRequest,
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitResult
} from "@/lib/rate-limit";
import { encodeList } from "@/lib/list-codec";

type DeliveryResultPayload = {
  logId?: number;
  accepted?: boolean;
  providerMessageId?: string;
  error?: string;
};

function toObject(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asDeliveryResultPayload(value: unknown): DeliveryResultPayload | null {
  const candidate = toObject(value);
  if (!candidate) return null;

  return {
    logId: typeof candidate.logId === "number" ? candidate.logId : undefined,
    accepted: typeof candidate.accepted === "boolean" ? candidate.accepted : undefined,
    providerMessageId:
      typeof candidate.providerMessageId === "string" ? candidate.providerMessageId : undefined,
    error: typeof candidate.error === "string" ? candidate.error : undefined
  };
}

function jsonWithThrottle(body: unknown, throttle: RateLimitResult, status = 200) {
  const response = NextResponse.json(body, { status });
  const headers = rateLimitHeaders(throttle);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

function assessWebhookAbuse(input: {
  eventType: string;
  rawBodyLength: number;
  signature: string | null;
  source: string;
}) {
  const allowedEventTypes = new Set(["integration.ping", "alerts.delivery.result"]);
  let abuseScore = 0;
  const flags: string[] = [];

  if (!allowedEventTypes.has(input.eventType)) {
    abuseScore += 20;
    flags.push("unknown_event_type");
  }
  if (!input.signature) {
    abuseScore += 24;
    flags.push("missing_signature");
  }
  if (input.rawBodyLength > 60_000) {
    abuseScore += 35;
    flags.push("payload_too_large");
  } else if (input.rawBodyLength > 25_000) {
    abuseScore += 12;
    flags.push("payload_large");
  }
  if (input.source.length > 120) {
    abuseScore += 10;
    flags.push("source_header_anomaly");
  }

  return {
    abuseScore,
    flags,
    blocked: abuseScore >= 40
  };
}

export async function POST(req: Request) {
  await ensureSeedData();
  const sourceIp = clientIdentifierFromRequest(req);
  const throttle = consumeRateLimit({
    namespace: "integrations:webhook:inbound",
    identifier: sourceIp,
    limit: 60,
    windowMs: 60_000
  });
  if (!throttle.allowed) {
    return jsonWithThrottle(
      {
        error: "Too many webhook requests. Try again shortly."
      },
      throttle,
      429
    );
  }

  const rawBody = await req.text();
  if (rawBody.length > 120_000) {
    await prisma.fraudEvent.create({
      data: {
        flow: "webhook_inbound",
        sourceIp,
        severity: "high",
        decision: "block",
        detail: `payload too large (${rawBody.length} bytes)`
      }
    });
    return jsonWithThrottle({ error: "Payload too large" }, throttle, 413);
  }

  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonWithThrottle({ error: "Invalid JSON body" }, throttle, 400);
  }

  const source = typeof parsed.source === "string" ? parsed.source : "external";
  const eventType = typeof parsed.eventType === "string" ? parsed.eventType : "unknown";
  const signature =
    req.headers.get("x-faypath-signature") ??
    req.headers.get("x-webhook-signature") ??
    req.headers.get("x-signature");
  const abuse = assessWebhookAbuse({
    eventType,
    rawBodyLength: rawBody.length,
    signature,
    source
  });

  const signatureValid = verifyIntegrationSignature({
    rawBody,
    signature
  });

  const event = await prisma.webhookEvent.create({
    data: {
      direction: "inbound",
      source,
      eventType,
      signature,
      signatureValid,
      abuseScore: abuse.abuseScore + (signatureValid === false ? 18 : 0),
      blocked: abuse.blocked,
      status: "received",
      payload: rawBody,
      receivedAt: new Date()
    }
  });

  if (abuse.flags.length > 0) {
    await prisma.fraudEvent.create({
      data: {
        flow: "webhook_inbound",
        sourceIp,
        severity: abuse.blocked ? "high" : "medium",
        decision: abuse.blocked ? "block" : "manual_review",
        detail: `eventId=${event.id};source=${source};flags=${encodeList(abuse.flags)}`
      }
    });
  }

  if (abuse.blocked) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "rejected",
        blocked: true,
        note: "Blocked by abuse controls",
        processedAt: new Date()
      }
    });

    return jsonWithThrottle({ error: "Webhook blocked by abuse controls" }, throttle, 403);
  }

  if (signatureValid === false) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "rejected",
        blocked: true,
        note: "Invalid webhook signature",
        processedAt: new Date()
      }
    });

    return jsonWithThrottle({ error: "Invalid signature" }, throttle, 401);
  }

  try {
    if (eventType === "integration.ping") {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "processed",
          note: "Ping acknowledged",
          processedAt: new Date()
        }
      });
      return jsonWithThrottle({ ok: true, eventId: event.id, status: "processed" }, throttle);
    }

    if (eventType === "alerts.delivery.result") {
      const payload = asDeliveryResultPayload(parsed.payload);
      if (!payload?.logId) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            status: "ignored",
            note: "Missing payload.logId",
            processedAt: new Date()
          }
        });
        return jsonWithThrottle({ ok: true, eventId: event.id, status: "ignored" }, throttle);
      }

      const result = await prisma.alertDeliveryLog.updateMany({
        where: { id: payload.logId },
        data: {
          ...(typeof payload.accepted === "boolean" ? { accepted: payload.accepted } : {}),
          ...(payload.providerMessageId ? { providerMessageId: payload.providerMessageId } : {})
        }
      });

      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "processed",
          note:
            result.count > 0
              ? `Updated delivery log ${payload.logId}`
              : `Delivery log ${payload.logId} not found`,
          processedAt: new Date()
        }
      });

      return jsonWithThrottle({ ok: true, eventId: event.id, status: "processed" }, throttle);
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "ignored",
        note: `Unhandled event type: ${eventType}`,
        processedAt: new Date()
      }
    });

    return jsonWithThrottle({ ok: true, eventId: event.id, status: "ignored" }, throttle);
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "failed",
        note: error instanceof Error ? error.message.slice(0, 500) : "Unknown webhook processing error",
        processedAt: new Date()
      }
    });

    return jsonWithThrottle({ error: "Webhook processing failed" }, throttle, 500);
  }
}
