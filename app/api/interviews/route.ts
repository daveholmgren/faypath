import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { mapInterview } from "@/lib/mappers";
import type { Interview } from "@/lib/types";

function isInterviewType(value: string): value is Interview["type"] {
  return value === "video" || value === "onsite" || value === "phone";
}

export async function GET() {
  await ensureSeedData();
  const records = await prisma.interview.findMany({
    orderBy: { time: "asc" }
  });
  return NextResponse.json(records.map(mapInterview));
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

  const body = (await req.json()) as Partial<Interview>;

  if (
    !body.person ||
    !body.owner ||
    !body.time ||
    typeof body.type !== "string" ||
    !isInterviewType(body.type)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const created = await prisma.interview.create({
    data: {
      person: body.person,
      owner: body.owner,
      time: new Date(body.time),
      type: body.type
    }
  });

  return NextResponse.json(mapInterview(created), { status: 201 });
}
