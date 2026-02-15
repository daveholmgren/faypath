import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { IntegrationRetrySummary } from "@/lib/types";

type OutboundIntegrationEventInput = {
  eventType: string;
  payload: Record<string, unknown>;
  source?: string;
};

type DeliveryOutcome = {
  status: "delivered" | "failed" | "skipped";
  httpStatus: number | null;
  note: string | null;
  processedAt: Date;
};

function signingSecret() {
  const secret = process.env.WEBHOOK_SHARED_SECRET?.trim();
  return secret || "";
}

function inboundSigningSecret() {
  const secret = process.env.WEBHOOK_INBOUND_SECRET?.trim() || signingSecret();
  return secret || "";
}

function configuredOutboundWebhookUrl() {
  const url = process.env.WEBHOOK_OUTBOUND_URL?.trim();
  return url || "";
}

function buildSignature(value: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(value).digest("hex")}`;
}

function withPrefix(prefix: string, note: string | null) {
  if (!note) return null;
  return `${prefix}: ${note}`;
}

async function deliverWebhookPayload(input: {
  deliveryUrl: string | null;
  rawPayload: string;
  signature: string | null;
}): Promise<DeliveryOutcome> {
  if (!input.deliveryUrl) {
    return {
      status: "skipped",
      httpStatus: null,
      note: "WEBHOOK_OUTBOUND_URL is not configured",
      processedAt: new Date()
    };
  }

  try {
    const response = await fetch(input.deliveryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(input.signature ? { "X-Faypath-Signature": input.signature } : {})
      },
      body: input.rawPayload
    });

    const rawResponse = await response.text();
    if (response.ok) {
      return {
        status: "delivered",
        httpStatus: response.status,
        note: null,
        processedAt: new Date()
      };
    }

    return {
      status: "failed",
      httpStatus: response.status,
      note: rawResponse.slice(0, 500),
      processedAt: new Date()
    };
  } catch (error) {
    return {
      status: "failed",
      httpStatus: null,
      note: error instanceof Error ? error.message.slice(0, 500) : "Unknown webhook delivery error",
      processedAt: new Date()
    };
  }
}

export function verifyIntegrationSignature(input: {
  rawBody: string;
  signature: string | null;
}): boolean | null {
  const secret = inboundSigningSecret();
  if (!secret) return null;
  if (!input.signature) return false;

  const expected = Buffer.from(buildSignature(input.rawBody, secret));
  const actual = Buffer.from(input.signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function emitOutboundIntegrationEvent(
  input: OutboundIntegrationEventInput
): Promise<void> {
  const deliveryUrl = configuredOutboundWebhookUrl();
  const source = input.source?.trim() || "faypath";
  const occurredAt = new Date();
  const envelope = {
    source,
    eventType: input.eventType,
    occurredAt: occurredAt.toISOString(),
    payload: input.payload
  };
  const rawPayload = JSON.stringify(envelope);

  const secret = signingSecret();
  const signature = secret ? buildSignature(rawPayload, secret) : null;

  const created = await prisma.webhookEvent.create({
    data: {
      direction: "outbound",
      source,
      eventType: input.eventType,
      signature,
      signatureValid: null,
      deliveryUrl: deliveryUrl || null,
      status: "queued",
      payload: rawPayload,
      receivedAt: occurredAt
    }
  });

  const outcome = await deliverWebhookPayload({
    deliveryUrl: deliveryUrl || null,
    rawPayload,
    signature
  });

  await prisma.webhookEvent.update({
    where: { id: created.id },
    data: {
      httpStatus: outcome.httpStatus,
      status: outcome.status,
      note: outcome.note,
      processedAt: outcome.processedAt
    }
  });
}

export async function retryFailedWebhookEvents(input?: {
  limit?: number;
  ids?: number[];
}): Promise<IntegrationRetrySummary> {
  const runAt = new Date();
  const maxLimit = 50;
  const requestedIds = Array.isArray(input?.ids)
    ? input.ids.filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const requestedLimit = Number.isFinite(input?.limit)
    ? Math.min(maxLimit, Math.max(1, Math.floor(input?.limit ?? 10)))
    : 10;

  const targets = await prisma.webhookEvent.findMany({
    where: {
      direction: "outbound",
      status: { in: ["failed", "skipped"] },
      ...(requestedIds.length ? { id: { in: requestedIds } } : {})
    },
    orderBy: { receivedAt: "desc" },
    take: requestedIds.length ? requestedIds.length : requestedLimit,
    select: {
      id: true,
      payload: true,
      deliveryUrl: true
    }
  });

  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  const retriedIds: number[] = [];

  for (const target of targets) {
    const deliveryUrl = target.deliveryUrl || configuredOutboundWebhookUrl() || null;
    const secret = signingSecret();
    const signature = secret ? buildSignature(target.payload, secret) : null;

    await prisma.webhookEvent.update({
      where: { id: target.id },
      data: {
        status: "queued",
        deliveryUrl,
        signature,
        note: "Retry requested",
        processedAt: null
      }
    });

    const outcome = await deliverWebhookPayload({
      deliveryUrl,
      rawPayload: target.payload,
      signature
    });

    await prisma.webhookEvent.update({
      where: { id: target.id },
      data: {
        status: outcome.status,
        httpStatus: outcome.httpStatus,
        note: withPrefix("Retry", outcome.note ?? (outcome.status === "delivered" ? "Delivered" : null)),
        processedAt: outcome.processedAt
      }
    });

    retriedIds.push(target.id);
    if (outcome.status === "delivered") delivered += 1;
    if (outcome.status === "failed") failed += 1;
    if (outcome.status === "skipped") skipped += 1;
  }

  return {
    runAt: runAt.toISOString(),
    requested: requestedIds.length || requestedLimit,
    retried: retriedIds.length,
    delivered,
    failed,
    skipped,
    retriedIds
  };
}
