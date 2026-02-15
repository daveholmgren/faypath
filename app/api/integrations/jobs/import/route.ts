import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { syncJobAlertsForAllUsers } from "@/lib/job-alerts";
import {
  EXTERNAL_IMPORT_MAX_ITEMS,
  getExternalImportTemplateCsv,
  importExternalJobs,
  parseExternalImportPayload
} from "@/lib/integrations/jobs-import";
import { consumeRateLimit, rateLimitHeaders, type RateLimitResult } from "@/lib/rate-limit";

function jsonWithThrottle(body: unknown, throttle: RateLimitResult, status = 200) {
  const response = NextResponse.json(body, { status });
  for (const [key, value] of Object.entries(rateLimitHeaders(throttle))) {
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
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Employer access required" }, { status: 403 });
  }

  return NextResponse.json({
    supportedFormats: ["json", "csv"] as const,
    maxListingsPerRequest: EXTERNAL_IMPORT_MAX_ITEMS,
    supportedModes: ["remote", "hybrid", "onsite"] as const,
    exampleSources: ["indeed_partner", "linkedin_partner", "ats_feed", "manual_csv"] as const,
    csvTemplate: getExternalImportTemplateCsv()
  });
}

export async function POST(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Employer access required" }, { status: 403 });
  }

  const throttle = consumeRateLimit({
    namespace: "integrations:jobs-import:post",
    identifier: session.user.id,
    limit: 12,
    windowMs: 60_000
  });
  if (!throttle.allowed) {
    return jsonWithThrottle({ error: "Too many import requests. Try again shortly." }, throttle, 429);
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
    importedById: session.user.id
  });

  if (!parsed.value.dryRun && (summary.created > 0 || summary.updated > 0)) {
    await syncJobAlertsForAllUsers();
  }

  return jsonWithThrottle(summary, throttle);
}
