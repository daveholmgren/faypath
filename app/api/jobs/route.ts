import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { syncJobAlertsForAllUsers } from "@/lib/job-alerts";
import { mapJob } from "@/lib/mappers";
import type { Job, WorkMode } from "@/lib/types";
import { encodeList, parseUniqueList } from "@/lib/list-codec";

function isWorkMode(value: string): value is WorkMode {
  return value === "remote" || value === "hybrid" || value === "onsite";
}

function parseListInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return parseUniqueList(
      value
        .map((entry) => (typeof entry === "string" ? entry : ""))
        .filter(Boolean)
        .join(", ")
    );
  }
  if (typeof value === "string") return parseUniqueList(value);
  return [];
}

function normalizeSponsorTier(value: unknown): Job["sponsorTier"] {
  if (value === "premium") return "premium";
  if (value === "boost") return "boost";
  return "none";
}

export async function GET() {
  await ensureSeedData();
  const jobs = await prisma.job.findMany({
    orderBy: [{ sponsored: "desc" }, { featuredEmployer: "desc" }, { meritFit: "desc" }, { createdAt: "desc" }]
  });
  return NextResponse.json(jobs.map(mapJob));
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

  const body = (await req.json()) as Partial<Job>;
  const tags = parseListInput(body.tags);
  const requiredScreeners = parseListInput((body as { requiredScreeners?: unknown }).requiredScreeners);
  const preferredScreeners = parseListInput((body as { preferredScreeners?: unknown }).preferredScreeners);
  const requiredSkills = parseListInput((body as { requiredSkills?: unknown }).requiredSkills);
  const preferredSkills = parseListInput((body as { preferredSkills?: unknown }).preferredSkills);

  if (
    !body.title ||
    !body.company ||
    !body.location ||
    !body.salary ||
    !body.evidence ||
    !tags.length ||
    typeof body.meritFit !== "number" ||
    typeof body.mode !== "string" ||
    !isWorkMode(body.mode)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const created = await prisma.job.create({
    data: {
      title: body.title,
      company: body.company,
      location: body.location,
      salary: body.salary,
      mode: body.mode,
      meritFit: body.meritFit,
      evidence: body.evidence,
      tags: encodeList(tags),
      requiredScreeners: encodeList(requiredScreeners),
      preferredScreeners: encodeList(preferredScreeners),
      requiredSkills: encodeList(requiredSkills.length ? requiredSkills : tags),
      preferredSkills: encodeList(preferredSkills),
      sponsorTier: normalizeSponsorTier((body as { sponsorTier?: unknown }).sponsorTier),
      sponsored: Boolean((body as { sponsored?: unknown }).sponsored),
      featuredEmployer: Boolean((body as { featuredEmployer?: unknown }).featuredEmployer),
      paywallTier:
        (body as { paywallTier?: unknown }).paywallTier === "advanced" ? "advanced" : "free",
      marketRegion:
        typeof (body as { marketRegion?: unknown }).marketRegion === "string"
          ? String((body as { marketRegion?: string }).marketRegion).trim() || "US"
          : "US",
      createdById: session.user.id
    }
  });

  await prisma.moderationItem.create({
    data: {
      type: "Job content flag",
      target: `Role: ${body.title}`,
      reason: "Auto-review generated for newly published posting.",
      status: "pending"
    }
  });

  await syncJobAlertsForAllUsers();
  return NextResponse.json(mapJob(created), { status: 201 });
}
