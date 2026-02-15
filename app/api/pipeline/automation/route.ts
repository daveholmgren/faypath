import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { getPipelineAutomationSnapshot, runPipelineAutomation } from "@/lib/pipeline-automation";
import type { PipelineAutomationSnapshot } from "@/lib/types";

type ScopeMode = "self" | "all";

const emptySnapshot: PipelineAutomationSnapshot = {
  scope: "none",
  generatedAt: new Date(0).toISOString(),
  totals: {
    applications: 0,
    recommendations: 0,
    scheduledInterviews: 0
  },
  recommendations: [],
  loadStats: [],
  rebalanceSuggestions: []
};

function parseScope(value: string | null | undefined): ScopeMode {
  return value === "all" ? "all" : "self";
}

export async function GET(req: Request) {
  await ensureSeedData();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(emptySnapshot);
  }

  const isEmployer = session.user.role === "EMPLOYER";
  const isAdmin = session.user.role === "ADMIN";
  if (!isEmployer && !isAdmin) {
    return NextResponse.json(emptySnapshot);
  }

  const url = new URL(req.url);
  const scope = parseScope(url.searchParams.get("scope"));
  if (scope === "all" && !isAdmin) {
    return NextResponse.json({ error: "Admin access required for scope=all" }, { status: 403 });
  }

  const snapshot = await getPipelineAutomationSnapshot({
    scope: scope === "all" ? "admin" : isAdmin ? "admin" : "employer",
    userId: session.user.id
  });

  return NextResponse.json(snapshot);
}

export async function POST(req: Request) {
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

  const body = (await req.json().catch(() => ({}))) as {
    scope?: string;
    applyLimit?: number;
    rebalanceLimit?: number;
  };

  const scope = parseScope(body.scope ?? "self");
  if (scope === "all" && !isAdmin) {
    return NextResponse.json({ error: "Admin access required for scope=all" }, { status: 403 });
  }

  const result = await runPipelineAutomation({
    scope: scope === "all" ? "admin" : isAdmin ? "admin" : "employer",
    userId: session.user.id,
    applyLimit: typeof body.applyLimit === "number" ? body.applyLimit : 3,
    rebalanceLimit: typeof body.rebalanceLimit === "number" ? body.rebalanceLimit : 2
  });

  const snapshot = await getPipelineAutomationSnapshot({
    scope: scope === "all" ? "admin" : isAdmin ? "admin" : "employer",
    userId: session.user.id
  });

  return NextResponse.json({ result, snapshot });
}
