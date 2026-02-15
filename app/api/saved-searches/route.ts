import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { syncJobAlertsForUser } from "@/lib/job-alerts";
import { mapSavedSearch } from "@/lib/mappers";
import type { DigestCadence, SavedSearchMode } from "@/lib/types";

function canCandidateRole(role: string | undefined) {
  return role === "CANDIDATE" || role === "ADMIN";
}

function isSavedSearchMode(value: string): value is SavedSearchMode {
  return value === "all" || value === "remote" || value === "hybrid" || value === "onsite";
}

function isDigestCadence(value: string): value is DigestCadence {
  return value === "instant" || value === "daily" || value === "weekly";
}

export async function GET() {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id || !canCandidateRole(session.user.role)) {
    return NextResponse.json([]);
  }

  const records = await prisma.savedSearch.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json(records.map(mapSavedSearch));
}

export async function POST(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!canCandidateRole(session.user.role)) {
    return NextResponse.json({ error: "Candidate access required" }, { status: 403 });
  }

  const body = (await req.json()) as {
    label?: string;
    keyword?: string;
    mode?: string;
    minScore?: number;
    emailEnabled?: boolean;
    inAppEnabled?: boolean;
    pushEnabled?: boolean;
    pushDeferred?: boolean;
    timezone?: string;
    digestCadence?: string;
    digestHour?: number;
  };

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  const mode = typeof body.mode === "string" ? body.mode : "all";
  const minScore = typeof body.minScore === "number" ? Math.round(body.minScore) : 70;
  const emailEnabled = typeof body.emailEnabled === "boolean" ? body.emailEnabled : true;
  const inAppEnabled = typeof body.inAppEnabled === "boolean" ? body.inAppEnabled : true;
  const pushEnabled = typeof body.pushEnabled === "boolean" ? body.pushEnabled : false;
  const pushDeferred = typeof body.pushDeferred === "boolean" ? body.pushDeferred : true;
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : "America/New_York";
  const digestCadence = typeof body.digestCadence === "string" ? body.digestCadence : "daily";
  const digestHour = typeof body.digestHour === "number" ? Math.round(body.digestHour) : 9;

  if (!label || !keyword) {
    return NextResponse.json({ error: "label and keyword are required" }, { status: 400 });
  }
  if (!isSavedSearchMode(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  if (!isDigestCadence(digestCadence)) {
    return NextResponse.json({ error: "Invalid digest cadence" }, { status: 400 });
  }
  if (!Number.isFinite(minScore) || minScore < 55 || minScore > 99) {
    return NextResponse.json({ error: "minScore must be between 55 and 99" }, { status: 400 });
  }
  if (!Number.isFinite(digestHour) || digestHour < 0 || digestHour > 23) {
    return NextResponse.json({ error: "digestHour must be between 0 and 23" }, { status: 400 });
  }

  const created = await prisma.savedSearch.create({
    data: {
      userId: session.user.id,
      label,
      keyword,
      mode,
      minScore,
      emailEnabled,
      inAppEnabled,
      pushEnabled,
      pushDeferred,
      timezone,
      digestCadence,
      digestHour
    }
  });

  await syncJobAlertsForUser(session.user.id);
  return NextResponse.json(mapSavedSearch(created), { status: 201 });
}

export async function PATCH(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!canCandidateRole(session.user.role)) {
    return NextResponse.json({ error: "Candidate access required" }, { status: 403 });
  }

  const body = (await req.json()) as {
    id?: number;
    label?: string;
    keyword?: string;
    mode?: string;
    minScore?: number;
    emailEnabled?: boolean;
    inAppEnabled?: boolean;
    pushEnabled?: boolean;
    pushDeferred?: boolean;
    timezone?: string;
    digestCadence?: string;
    digestHour?: number;
  };

  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const existing = await prisma.savedSearch.findFirst({
    where: {
      id: body.id,
      userId: session.user.id
    }
  });

  if (!existing) {
    return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
  }

  const updateData: {
    label?: string;
    keyword?: string;
    mode?: SavedSearchMode;
    minScore?: number;
    emailEnabled?: boolean;
    inAppEnabled?: boolean;
    pushEnabled?: boolean;
    pushDeferred?: boolean;
    timezone?: string;
    digestCadence?: DigestCadence;
    digestHour?: number;
  } = {};

  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
    updateData.label = label;
  }

  if (typeof body.keyword === "string") {
    const keyword = body.keyword.trim();
    if (!keyword) return NextResponse.json({ error: "keyword cannot be empty" }, { status: 400 });
    updateData.keyword = keyword;
  }

  if (typeof body.mode === "string") {
    if (!isSavedSearchMode(body.mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    updateData.mode = body.mode;
  }

  if (typeof body.minScore === "number") {
    const minScore = Math.round(body.minScore);
    if (!Number.isFinite(minScore) || minScore < 55 || minScore > 99) {
      return NextResponse.json({ error: "minScore must be between 55 and 99" }, { status: 400 });
    }
    updateData.minScore = minScore;
  }

  if (typeof body.emailEnabled === "boolean") {
    updateData.emailEnabled = body.emailEnabled;
  }

  if (typeof body.inAppEnabled === "boolean") {
    updateData.inAppEnabled = body.inAppEnabled;
  }

  if (typeof body.pushEnabled === "boolean") {
    updateData.pushEnabled = body.pushEnabled;
  }

  if (typeof body.pushDeferred === "boolean") {
    updateData.pushDeferred = body.pushDeferred;
  }

  if (typeof body.timezone === "string") {
    const timezone = body.timezone.trim();
    if (!timezone) {
      return NextResponse.json({ error: "timezone cannot be empty" }, { status: 400 });
    }
    updateData.timezone = timezone;
  }

  if (typeof body.digestCadence === "string") {
    if (!isDigestCadence(body.digestCadence)) {
      return NextResponse.json({ error: "Invalid digest cadence" }, { status: 400 });
    }
    updateData.digestCadence = body.digestCadence;
  }

  if (typeof body.digestHour === "number") {
    const digestHour = Math.round(body.digestHour);
    if (!Number.isFinite(digestHour) || digestHour < 0 || digestHour > 23) {
      return NextResponse.json({ error: "digestHour must be between 0 and 23" }, { status: 400 });
    }
    updateData.digestHour = digestHour;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.savedSearch.update({
    where: { id: body.id },
    data: updateData
  });

  await syncJobAlertsForUser(session.user.id);
  return NextResponse.json(mapSavedSearch(updated));
}

export async function DELETE(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!canCandidateRole(session.user.role)) {
    return NextResponse.json({ error: "Candidate access required" }, { status: 403 });
  }

  const body = (await req.json()) as { id?: number };
  if (typeof body.id !== "number") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const result = await prisma.savedSearch.deleteMany({
    where: {
      id: body.id,
      userId: session.user.id
    }
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true as const });
}
