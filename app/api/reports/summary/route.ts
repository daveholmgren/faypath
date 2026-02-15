import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { getAlertDeliveryPreview } from "@/lib/alert-delivery";
import { getEmployerAnalytics } from "@/lib/employer-analytics";
import { getPipelineAutomationSnapshot } from "@/lib/pipeline-automation";
import type { IntegrationReportSummary } from "@/lib/types";

type ScopeMode = "self" | "all";

function parseScope(value: string | null | undefined): ScopeMode {
  return value === "all" ? "all" : "self";
}

export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const scope = parseScope(url.searchParams.get("scope"));
  if (scope === "all" && !isAdmin) {
    return NextResponse.json({ error: "Admin access required for scope=all" }, { status: 403 });
  }

  const analyticsScope = scope === "all" || isAdmin ? "admin" : "employer";
  const deliveryScope = scope === "all" ? "all" : "self";

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
      userId: deliveryScope === "all" ? undefined : session.user.id
    })
  ]);

  const summary: IntegrationReportSummary = {
    generatedAt: new Date().toISOString(),
    scope: analyticsScope,
    analytics,
    pipeline,
    deliveryPreview
  };

  return NextResponse.json(summary);
}
