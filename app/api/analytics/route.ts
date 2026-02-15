import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { getEmployerAnalytics } from "@/lib/employer-analytics";
import type { EmployerAnalytics } from "@/lib/types";

const emptyAnalytics: EmployerAnalytics = {
  scope: "none",
  advancedEnabled: false,
  paywallReason: "Sign in as an employer to unlock analytics.",
  totalJobs: 0,
  totalApplications: 0,
  avgMeritFit: 0,
  shortlistCount: 0,
  interviewsScheduled: 0,
  sponsoredJobs: 0,
  featuredEmployers: 0,
  statusBreakdown: [],
  topRoles: []
};

export async function GET() {
  await ensureSeedData();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(emptyAnalytics);
  }

  const isEmployer = session.user.role === "EMPLOYER";
  const isAdmin = session.user.role === "ADMIN";
  if (!isEmployer && !isAdmin) {
    return NextResponse.json(emptyAnalytics);
  }

  return NextResponse.json(
    await getEmployerAnalytics({
      scope: isAdmin ? "admin" : "employer",
      userId: session.user.id
    })
  );
}
