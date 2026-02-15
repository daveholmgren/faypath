import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { mapTalent } from "@/lib/mappers";

export async function GET() {
  await ensureSeedData();
  const profiles = await prisma.talentProfile.findMany({ orderBy: { merit: "desc" } });
  return NextResponse.json(profiles.map(mapTalent));
}
