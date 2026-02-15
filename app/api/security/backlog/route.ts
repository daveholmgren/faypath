import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { prisma } from "@/lib/prisma";
import { getSecurityBacklogSnapshot } from "@/lib/security-backlog";

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

  return NextResponse.json(await getSecurityBacklogSnapshot());
}

export async function PATCH(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = (await req.json()) as {
    id?: number;
    status?: string;
    owner?: string;
    notes?: string;
  };

  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const updateData: { status?: string; owner?: string | null; notes?: string } = {};
  if (typeof body.status === "string" && body.status.trim()) {
    updateData.status = body.status.trim();
  }
  if (typeof body.owner === "string") {
    updateData.owner = body.owner.trim() || null;
  }
  if (typeof body.notes === "string" && body.notes.trim()) {
    updateData.notes = body.notes.trim();
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
  }

  await prisma.securityBacklogItem.update({
    where: { id: body.id },
    data: updateData
  });

  return NextResponse.json(await getSecurityBacklogSnapshot());
}
