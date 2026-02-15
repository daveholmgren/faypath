import { prisma } from "@/lib/prisma";
import type { EmployerMarketIntel, MarketCompBand, MarketLocationDepth } from "@/lib/types";

type Scope = "employer" | "admin";

function parseSalaryRange(value: string) {
  const matches = Array.from(value.matchAll(/(\d+(?:\.\d+)?)(\s*[kK])?/g));
  if (!matches.length) return null;

  const numbers = matches
    .map((match) => {
      const base = Number(match[1]);
      if (!Number.isFinite(base)) return null;
      return match[2] ? Math.round(base * 1000) : Math.round(base);
    })
    .filter((entry): entry is number => entry !== null);

  if (!numbers.length) return null;
  const sorted = numbers.slice().sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    midpoint: Math.round((sorted[0] + sorted[sorted.length - 1]) / 2)
  };
}

function buildCompBands(): MarketCompBand[] {
  return [
    {
      label: "<100k",
      minSalary: 0,
      maxSalary: 99_999,
      jobs: 0,
      applications: 0
    },
    {
      label: "100k-140k",
      minSalary: 100_000,
      maxSalary: 140_000,
      jobs: 0,
      applications: 0
    },
    {
      label: "140k-180k",
      minSalary: 140_001,
      maxSalary: 180_000,
      jobs: 0,
      applications: 0
    },
    {
      label: "180k+",
      minSalary: 180_001,
      maxSalary: 1_000_000,
      jobs: 0,
      applications: 0
    }
  ];
}

function locationDepthLabel(supplyDemandRatio: number): MarketLocationDepth["talentDepth"] {
  if (supplyDemandRatio < 1) return "thin";
  if (supplyDemandRatio < 2.5) return "balanced";
  return "deep";
}

export async function getEmployerMarketIntel(input: {
  scope: Scope;
  userId: string;
}): Promise<EmployerMarketIntel> {
  const jobWhere = input.scope === "admin" ? {} : { createdById: input.userId };
  const jobs = await prisma.job.findMany({
    where: jobWhere,
    select: {
      id: true,
      location: true,
      salary: true
    }
  });

  if (!jobs.length) {
    return {
      generatedAt: new Date().toISOString(),
      scope: input.scope,
      demandIndex: 0,
      supplyDemandRatio: 0,
      compBands: [],
      locationDepth: []
    };
  }

  const jobIds = jobs.map((job) => job.id);
  const applications = await prisma.application.findMany({
    where: {
      jobId: { in: jobIds }
    },
    select: {
      jobId: true
    }
  });

  const applicationsByJob = new Map<number, number>();
  for (const application of applications) {
    applicationsByJob.set(
      application.jobId,
      (applicationsByJob.get(application.jobId) ?? 0) + 1
    );
  }

  const compBands = buildCompBands();
  const locationRollup = new Map<string, { jobOpenings: number; activeApplicants: number }>();

  for (const job of jobs) {
    const appCount = applicationsByJob.get(job.id) ?? 0;
    const parsed = parseSalaryRange(job.salary);
    if (parsed) {
      const band = compBands.find(
        (entry) => parsed.midpoint >= entry.minSalary && parsed.midpoint <= entry.maxSalary
      );
      if (band) {
        band.jobs += 1;
        band.applications += appCount;
      }
    }

    const location = job.location.trim() || "Unspecified";
    const row = locationRollup.get(location) ?? { jobOpenings: 0, activeApplicants: 0 };
    row.jobOpenings += 1;
    row.activeApplicants += appCount;
    locationRollup.set(location, row);
  }

  const totalJobs = jobs.length;
  const totalApplications = applications.length;
  const supplyDemandRatio = Number(
    (totalApplications / Math.max(1, totalJobs)).toFixed(2)
  );
  const demandIndex = Math.round(
    Math.min(100, totalJobs * 8 + totalApplications * 1.8)
  );

  const locationDepth = Array.from(locationRollup.entries())
    .map(([location, value]) => {
      const ratio = Number(
        (value.activeApplicants / Math.max(1, value.jobOpenings)).toFixed(2)
      );
      return {
        location,
        jobOpenings: value.jobOpenings,
        activeApplicants: value.activeApplicants,
        talentDepth: locationDepthLabel(ratio),
        supplyDemandRatio: ratio
      };
    })
    .sort(
      (a, b) =>
        b.jobOpenings - a.jobOpenings ||
        b.activeApplicants - a.activeApplicants ||
        a.location.localeCompare(b.location)
    )
    .slice(0, 8);

  return {
    generatedAt: new Date().toISOString(),
    scope: input.scope,
    demandIndex,
    supplyDemandRatio,
    compBands: compBands.filter((band) => band.jobs > 0),
    locationDepth
  };
}
