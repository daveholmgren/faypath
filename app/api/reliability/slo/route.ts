import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { getReliabilitySloSnapshot } from "@/lib/reliability-slo";

export async function GET() {
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

  return NextResponse.json(
    await getReliabilitySloSnapshot({
      scope: isAdmin ? "admin" : "employer",
      userId: session.user.id
    })
  );
}
