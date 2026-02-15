import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";

export async function GET() {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ profileIds: [] as number[] });
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ profileIds: [] as number[] });
  }

  const entries = await prisma.shortlistEntry.findMany({
    where: { employerId: session.user.id },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ profileIds: entries.map((entry) => entry.profileId) });
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

  const body = (await req.json()) as { profileId?: number };
  if (typeof body.profileId !== "number") {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  const profile = await prisma.talentProfile.findUnique({ where: { id: body.profileId } });
  if (!profile) {
    return NextResponse.json({ error: "Talent profile not found" }, { status: 404 });
  }

  await prisma.shortlistEntry.upsert({
    where: {
      employerId_profileId: {
        employerId: session.user.id,
        profileId: body.profileId
      }
    },
    update: {},
    create: {
      employerId: session.user.id,
      profileId: body.profileId
    }
  });

  const entries = await prisma.shortlistEntry.findMany({
    where: { employerId: session.user.id },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ profileIds: entries.map((entry) => entry.profileId) }, { status: 201 });
}

export async function DELETE(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Employer access required" }, { status: 403 });
  }

  const body = (await req.json()) as { profileId?: number };
  if (typeof body.profileId !== "number") {
    return NextResponse.json({ error: "profileId is required" }, { status: 400 });
  }

  await prisma.shortlistEntry.deleteMany({
    where: {
      employerId: session.user.id,
      profileId: body.profileId
    }
  });

  const entries = await prisma.shortlistEntry.findMany({
    where: { employerId: session.user.id },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ profileIds: entries.map((entry) => entry.profileId) });
}
