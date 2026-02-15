import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { syncJobAlertsForUser } from "@/lib/job-alerts";
import { mapJobAlert } from "@/lib/mappers";
import type { AlertFeed } from "@/lib/types";

function canCandidateRole(role: string | undefined) {
  return role === "CANDIDATE" || role === "ADMIN";
}

const emptyFeed: AlertFeed = {
  alerts: [],
  unread: 0,
  pendingEmail: 0,
  pendingInApp: 0,
  pendingPush: 0
};

async function getAlertFeed(userId: string): Promise<AlertFeed> {
  const [records, unread, pendingEmail, pendingInApp, pendingPush] = await Promise.all([
    prisma.jobAlert.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        savedSearch: {
          select: {
            label: true,
            emailEnabled: true,
            inAppEnabled: true,
            pushEnabled: true
          }
        },
        job: true
      }
    }),
    prisma.jobAlert.count({
      where: {
        userId,
        readAt: null
      }
    }),
    prisma.jobAlert.count({
      where: {
        userId,
        emailSentAt: null,
        savedSearch: { emailEnabled: true }
      }
    }),
    prisma.jobAlert.count({
      where: {
        userId,
        inAppSentAt: null,
        savedSearch: { inAppEnabled: true }
      }
    }),
    prisma.jobAlert.count({
      where: {
        userId,
        pushSentAt: null,
        savedSearch: { pushEnabled: true }
      }
    })
  ]);

  return {
    alerts: records.map(mapJobAlert),
    unread,
    pendingEmail,
    pendingInApp,
    pendingPush
  };
}

export async function GET() {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id || !canCandidateRole(session.user.role)) {
    return NextResponse.json(emptyFeed);
  }

  await syncJobAlertsForUser(session.user.id);
  return NextResponse.json(await getAlertFeed(session.user.id));
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
    alertId?: number;
    markAll?: boolean;
  };

  const now = new Date();

  if (body.markAll) {
    await prisma.jobAlert.updateMany({
      where: {
        userId: session.user.id,
        readAt: null
      },
      data: { readAt: now }
    });
  } else if (typeof body.alertId === "number") {
    await prisma.jobAlert.updateMany({
      where: {
        id: body.alertId,
        userId: session.user.id,
        readAt: null
      },
      data: { readAt: now }
    });
  } else {
    return NextResponse.json({ error: "alertId or markAll is required" }, { status: 400 });
  }

  return NextResponse.json(await getAlertFeed(session.user.id));
}
