import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { mapModeration } from "@/lib/mappers";

export async function GET() {
  await ensureSeedData();
  const records = await prisma.moderationItem.findMany({
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(records.map(mapModeration));
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

  const body = (await req.json()) as {
    itemId?: number;
    action?: "approve" | "reject";
  };

  if (
    typeof body.itemId !== "number" ||
    (body.action !== "approve" && body.action !== "reject")
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const item = await prisma.moderationItem.update({
    where: { id: body.itemId },
    data: {
      status: body.action === "approve" ? "approved" : "rejected"
    }
  }).catch(() => null);

  if (!item) {
    return NextResponse.json({ error: "Moderation item not found" }, { status: 404 });
  }

  return NextResponse.json(mapModeration(item));
}
