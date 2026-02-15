import { prisma } from "@/lib/prisma";
import type { SavedSearchMode, WorkMode } from "@/lib/types";

type JobRecord = {
  id: number;
  title: string;
  company: string;
  location: string;
  mode: string;
  meritFit: number;
  tags: string;
};

type SavedSearchRecord = {
  id: number;
  userId: string;
  label: string;
  keyword: string;
  mode: string;
  minScore: number;
};

function isWorkMode(value: string): value is WorkMode {
  return value === "remote" || value === "hybrid" || value === "onsite";
}

function isSavedSearchMode(value: string): value is SavedSearchMode {
  return value === "all" || isWorkMode(value);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesSearch(job: JobRecord, search: SavedSearchRecord) {
  if (!isSavedSearchMode(search.mode)) return false;

  const keyword = normalize(search.keyword);
  const haystack = normalize(`${job.title} ${job.company} ${job.location} ${job.tags}`);
  const modeMatches = search.mode === "all" || search.mode === job.mode;
  const keywordMatches = !keyword || haystack.includes(keyword);
  const scoreMatches = job.meritFit >= search.minScore;

  return modeMatches && keywordMatches && scoreMatches;
}

function buildReason(search: SavedSearchRecord, job: JobRecord) {
  return `Matched "${search.label}" with merit fit ${job.meritFit}.`;
}

export async function syncJobAlertsForUser(userId: string) {
  const [searches, jobs] = await Promise.all([
    prisma.savedSearch.findMany({
      where: { userId },
      select: {
        id: true,
        userId: true,
        label: true,
        keyword: true,
        mode: true,
        minScore: true
      }
    }),
    prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        mode: true,
        meritFit: true,
        tags: true
      }
    })
  ]);

  if (!searches.length || !jobs.length) return;

  const operations: Promise<unknown>[] = [];

  for (const search of searches) {
    for (const job of jobs) {
      if (!matchesSearch(job, search)) continue;

      operations.push(
        prisma.jobAlert.upsert({
          where: {
            userId_savedSearchId_jobId: {
              userId,
              savedSearchId: search.id,
              jobId: job.id
            }
          },
          update: {},
          create: {
            userId,
            savedSearchId: search.id,
            jobId: job.id,
            reason: buildReason(search, job)
          }
        })
      );
    }
  }

  if (operations.length) {
    await Promise.all(operations);
  }
}

export async function syncJobAlertsForAllUsers() {
  const searches = await prisma.savedSearch.findMany({
    select: { userId: true }
  });

  const userIds = Array.from(new Set(searches.map((search) => search.userId)));
  if (!userIds.length) return;

  await Promise.all(userIds.map((userId) => syncJobAlertsForUser(userId)));
}
