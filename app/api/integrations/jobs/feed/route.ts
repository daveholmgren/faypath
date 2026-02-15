import { NextResponse } from "next/server";
import { syncJobAlertsForAllUsers } from "@/lib/job-alerts";
import { importExternalJobs, parseExternalImportPayload } from "@/lib/integrations/jobs-import";
import {
  clientIdentifierFromRequest,
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitResult
} from "@/lib/rate-limit";

function jsonWithThrottle(body: unknown, throttle: RateLimitResult, status = 200) {
  const response = NextResponse.json(body, { status });
  for (const [key, value] of Object.entries(rateLimitHeaders(throttle))) {
    response.headers.set(key, value);
  }
  return response;
}

function tokenFromRequest(req: Request) {
  const auth = req.headers.get("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return req.headers.get("x-ingest-token")?.trim() ?? "";
}

export async function POST(req: Request) {
  const throttle = consumeRateLimit({
    namespace: "integrations:jobs-feed:post",
    identifier: clientIdentifierFromRequest(req),
    limit: 20,
    windowMs: 60_000
  });
  if (!throttle.allowed) {
    return jsonWithThrottle({ error: "Too many feed requests. Try again shortly." }, throttle, 429);
  }

  const expectedToken = process.env.EXTERNAL_INGEST_TOKEN?.trim() ?? "";
  if (!expectedToken) {
    return jsonWithThrottle(
      { error: "External feed is not configured (EXTERNAL_INGEST_TOKEN is missing)." },
      throttle,
      503
    );
  }

  const token = tokenFromRequest(req);
  if (!token || token !== expectedToken) {
    return jsonWithThrottle({ error: "Invalid feed token." }, throttle, 401);
  }

  const body = await req.json().catch(() => null);
  const parsed = parseExternalImportPayload(body);
  if (!parsed.ok) {
    return jsonWithThrottle({ error: parsed.error }, throttle, 400);
  }

  const summary = await importExternalJobs({
    source: parsed.value.source,
    format: parsed.value.format,
    dryRun: parsed.value.dryRun,
    listings: parsed.value.listings,
    importedById: null
  });

  if (!parsed.value.dryRun && (summary.created > 0 || summary.updated > 0)) {
    await syncJobAlertsForAllUsers();
  }

  return jsonWithThrottle(summary, throttle);
}
