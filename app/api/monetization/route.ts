import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { prisma } from "@/lib/prisma";
import type { MonetizationSnapshot } from "@/lib/types";

const emptySnapshot: MonetizationSnapshot = {
  plan: "free",
  advancedAnalyticsUnlocked: false,
  sponsoredJobs: 0,
  featuredEmployerProfiles: 0,
  paywalledInsights: ["Advanced role analytics", "Market intel depth", "Reliability SLO board"]
};

export async function GET() {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(emptySnapshot);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      billingPlan: true
    }
  });
  if (!user) return NextResponse.json(emptySnapshot);

  const isEmployer = session.user.role === "EMPLOYER" || session.user.role === "ADMIN";
  if (!isEmployer) return NextResponse.json(emptySnapshot);

  const [sponsoredJobs, featuredEmployerProfiles] = await Promise.all([
    prisma.job.count({
      where:
        session.user.role === "ADMIN"
          ? { sponsored: true }
          : { createdById: session.user.id, sponsored: true }
    }),
    prisma.job.count({
      where:
        session.user.role === "ADMIN"
          ? { featuredEmployer: true }
          : { createdById: session.user.id, featuredEmployer: true }
    })
  ]);

  const plan = user.billingPlan as MonetizationSnapshot["plan"];
  return NextResponse.json({
    plan: plan === "enterprise" || plan === "growth" || plan === "pro" ? plan : "free",
    advancedAnalyticsUnlocked: plan !== "free",
    sponsoredJobs,
    featuredEmployerProfiles,
    paywalledInsights: ["Advanced role analytics", "Market intel depth", "Reliability SLO board"]
  } satisfies MonetizationSnapshot);
}
