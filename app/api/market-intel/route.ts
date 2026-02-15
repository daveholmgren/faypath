import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { getEmployerMarketIntel } from "@/lib/market-intel";
import type { EmployerMarketIntel } from "@/lib/types";

const emptyMarketIntel: EmployerMarketIntel = {
  generatedAt: new Date(0).toISOString(),
  scope: "none",
  demandIndex: 0,
  supplyDemandRatio: 0,
  compBands: [],
  locationDepth: []
};

export async function GET() {
  await ensureSeedData();
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(emptyMarketIntel);
  }

  const isEmployer = session.user.role === "EMPLOYER";
  const isAdmin = session.user.role === "ADMIN";
  if (!isEmployer && !isAdmin) {
    return NextResponse.json(emptyMarketIntel);
  }

  return NextResponse.json(
    await getEmployerMarketIntel({
      scope: isAdmin ? "admin" : "employer",
      userId: session.user.id
    })
  );
}
