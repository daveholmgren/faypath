import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { mapApplication } from "@/lib/mappers";
import {
  clientIdentifierFromRequest,
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitResult
} from "@/lib/rate-limit";
import { encodeList } from "@/lib/list-codec";
import { evaluateApplication, parseScreenerAnswers } from "@/lib/application-scoring";

function jsonWithThrottle(body: unknown, throttle: RateLimitResult, status = 200) {
  const response = NextResponse.json(body, { status });
  const headers = rateLimitHeaders(throttle);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export async function GET() {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([]);

  const where =
    session.user.role === "ADMIN"
      ? {}
      : session.user.role === "EMPLOYER"
        ? { job: { createdById: session.user.id } }
        : { userId: session.user.id };

  const records = await prisma.application.findMany({
    where,
    orderBy:
      session.user.role === "EMPLOYER" || session.user.role === "ADMIN"
        ? [{ autoRankScore: "desc" }, { appliedAt: "desc" }]
        : [{ appliedAt: "desc" }]
  });

  return NextResponse.json(records.map(mapApplication));
}

export async function POST(req: Request) {
  await ensureSeedData();
  const throttle = consumeRateLimit({
    namespace: "applications:create",
    identifier: clientIdentifierFromRequest(req),
    limit: 24,
    windowMs: 60_000
  });
  if (!throttle.allowed) {
    return jsonWithThrottle(
      { error: "Too many application requests. Try again shortly." },
      throttle,
      429
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return jsonWithThrottle({ error: "Authentication required" }, throttle, 401);
  }

  if (session.user.role !== "CANDIDATE" && session.user.role !== "ADMIN") {
    return jsonWithThrottle({ error: "Candidate access required" }, throttle, 403);
  }

  const body = (await req.json()) as { jobId?: number; answers?: unknown };
  if (typeof body.jobId !== "number") {
    return jsonWithThrottle({ error: "jobId is required" }, throttle, 400);
  }

  const [job, user] = await Promise.all([
    prisma.job.findUnique({ where: { id: body.jobId } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        createdAt: true,
        profileSkills: true,
        profileCompleteness: true,
        isFlagged: true
      }
    })
  ]);
  if (!job) return jsonWithThrottle({ error: "Job not found" }, throttle, 404);
  if (!user) return jsonWithThrottle({ error: "User not found" }, throttle, 404);

  const existing = await prisma.application.findFirst({
    where: { userId: session.user.id, jobId: body.jobId }
  });
  if (existing) return jsonWithThrottle(mapApplication(existing), throttle);

  const sourceIp = clientIdentifierFromRequest(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;
  const answers = parseScreenerAnswers(body.answers);

  const [recentApplicationCount, priorFraudEventsForIp] = await Promise.all([
    prisma.application.count({
      where: {
        userId: session.user.id,
        appliedAt: {
          gte: new Date(Date.now() - 15 * 60 * 1000)
        }
      }
    }),
    prisma.fraudEvent.count({
      where: {
        sourceIp,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        },
        decision: {
          in: ["manual_review", "block"]
        }
      }
    })
  ]);

  const scoring = evaluateApplication({
    job: {
      meritFit: job.meritFit,
      requiredScreeners: job.requiredScreeners,
      preferredScreeners: job.preferredScreeners,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      title: job.title,
      company: job.company
    },
    user: {
      profileSkills: user.profileSkills,
      profileCompleteness: user.profileCompleteness,
      createdAt: user.createdAt,
      email: user.email,
      isFlagged: user.isFlagged
    },
    answers,
    recentApplicationCount,
    priorFraudEventsForIp
  });

  const fraudDecision = scoring.blockForAbuse
    ? "block"
    : scoring.needsManualReview
      ? "manual_review"
      : "allow";

  if (scoring.riskFlags.length > 0) {
    await prisma.fraudEvent.create({
      data: {
        flow: "application_create",
        userId: session.user.id,
        sourceIp,
        severity:
          scoring.riskScore >= 72 ? "high" : scoring.riskScore >= 45 ? "medium" : "low",
        decision: fraudDecision,
        detail: `jobId=${body.jobId};risk=${scoring.riskScore};flags=${encodeList(scoring.riskFlags)}`
      }
    });
  }

  if (scoring.blockForAbuse) {
    return jsonWithThrottle(
      { error: "Application blocked due to abuse risk. Contact support if this is a mistake." },
      throttle,
      429
    );
  }

  const record = await prisma.application.create({
    data: {
      jobId: body.jobId,
      userId: session.user.id,
      status: "Applied",
      screenerRequiredPassed: scoring.requiredPassed,
      screenerRequiredScore: scoring.requiredScore,
      screenerPreferredScore: scoring.preferredScore,
      autoRankScore: scoring.autoRankScore,
      matchExplanation: scoring.matchExplanation,
      missingSkills: encodeList(scoring.missingSkills),
      profileFixSuggestions: encodeList(scoring.profileFixSuggestions),
      submittedAnswers: scoring.submittedAnswers,
      riskScore: scoring.riskScore,
      riskFlags: encodeList(scoring.riskFlags),
      needsManualReview: scoring.needsManualReview,
      sourceIp,
      userAgent
    }
  });

  return jsonWithThrottle(mapApplication(record), throttle, 201);
}
