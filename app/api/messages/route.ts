import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureSeedData } from "@/lib/seed";
import { mapConversation } from "@/lib/mappers";

function roleFromSession(role: string | undefined): "candidate" | "employer" {
  return role === "EMPLOYER" || role === "ADMIN" ? "employer" : "candidate";
}

async function ensurePresenceRows() {
  const conversations = await prisma.conversation.findMany({
    select: { id: true }
  });

  await Promise.all(
    conversations.flatMap((conversation) => [
      prisma.conversationPresence.upsert({
        where: {
          conversationId_role: {
            conversationId: conversation.id,
            role: "candidate"
          }
        },
        update: {},
        create: {
          conversationId: conversation.id,
          role: "candidate"
        }
      }),
      prisma.conversationPresence.upsert({
        where: {
          conversationId_role: {
            conversationId: conversation.id,
            role: "employer"
          }
        },
        update: {},
        create: {
          conversationId: conversation.id,
          role: "employer"
        }
      })
    ])
  );
}

async function getConversations() {
  const records = await prisma.conversation.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      messages: {
        orderBy: { sentAt: "asc" }
      },
      presence: {
        orderBy: { role: "asc" }
      }
    }
  });

  return records.map(mapConversation);
}

export async function GET() {
  await ensureSeedData();
  await ensurePresenceRows();
  return NextResponse.json(await getConversations());
}

export async function POST(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await req.json()) as {
    conversationId?: number;
    text?: string;
  };

  if (typeof body.conversationId !== "number" || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: body.conversationId }
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const senderRole = roleFromSession(session.user.role);
  const otherRole = senderRole === "candidate" ? "employer" : "candidate";
  const now = new Date();

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: body.conversationId,
        role: senderRole,
        text: body.text.trim()
      }
    }),
    prisma.message.create({
      data: {
        conversationId: body.conversationId,
        role: otherRole,
        text: "Received. We will follow up with next steps shortly."
      }
    }),
    prisma.conversationPresence.upsert({
      where: {
        conversationId_role: {
          conversationId: body.conversationId,
          role: senderRole
        }
      },
      update: {
        lastSeenAt: now,
        typingUntil: null
      },
      create: {
        conversationId: body.conversationId,
        role: senderRole,
        lastSeenAt: now,
        typingUntil: null
      }
    }),
    prisma.conversationPresence.upsert({
      where: {
        conversationId_role: {
          conversationId: body.conversationId,
          role: otherRole
        }
      },
      update: {
        typingUntil: null
      },
      create: {
        conversationId: body.conversationId,
        role: otherRole,
        typingUntil: null
      }
    })
  ]);

  const updated = await prisma.conversation.findUnique({
    where: { id: body.conversationId },
    include: {
      messages: {
        orderBy: { sentAt: "asc" }
      },
      presence: {
        orderBy: { role: "asc" }
      }
    }
  });

  return NextResponse.json(updated ? mapConversation(updated) : null, { status: 201 });
}

export async function PATCH(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await req.json()) as {
    conversationId?: number;
    typing?: boolean;
    seen?: boolean;
  };

  if (typeof body.conversationId !== "number") {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  if (typeof body.typing !== "boolean" && typeof body.seen !== "boolean") {
    return NextResponse.json({ error: "typing or seen state is required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: body.conversationId }
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const role = roleFromSession(session.user.role);
  const updateData: { typingUntil?: Date | null; lastSeenAt?: Date } = {};

  if (typeof body.typing === "boolean") {
    updateData.typingUntil = body.typing ? new Date(Date.now() + 8000) : null;
  }

  if (body.seen) {
    updateData.lastSeenAt = new Date();
  }

  await prisma.conversationPresence.upsert({
    where: {
      conversationId_role: {
        conversationId: body.conversationId,
        role
      }
    },
    update: updateData,
    create: {
      conversationId: body.conversationId,
      role,
      typingUntil: typeof body.typing === "boolean" ? updateData.typingUntil ?? null : null,
      lastSeenAt: updateData.lastSeenAt ?? null
    }
  });

  const updated = await prisma.conversation.findUnique({
    where: { id: body.conversationId },
    include: {
      messages: {
        orderBy: { sentAt: "asc" }
      },
      presence: {
        orderBy: { role: "asc" }
      }
    }
  });

  return NextResponse.json(updated ? mapConversation(updated) : null);
}
