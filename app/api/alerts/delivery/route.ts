import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ensureSeedData } from "@/lib/seed";
import { getAlertDeliveryPreview, runAlertDeliveryJob } from "@/lib/alert-delivery";

type Scope = "self" | "all";

function resolveScope(scope: string | null | undefined): Scope {
  return scope === "all" ? "all" : "self";
}

export async function GET(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const scope = resolveScope(url.searchParams.get("scope"));
  const isAdmin = session.user.role === "ADMIN";

  if (scope === "all" && !isAdmin) {
    return NextResponse.json({ error: "Admin access required for scope=all" }, { status: 403 });
  }

  const preview = await getAlertDeliveryPreview({
    scope,
    userId: scope === "all" ? undefined : session.user.id
  });

  return NextResponse.json(preview);
}

export async function POST(req: Request) {
  await ensureSeedData();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { scope?: string };
  const scope = resolveScope(body.scope);
  const isAdmin = session.user.role === "ADMIN";

  if (scope === "all" && !isAdmin) {
    return NextResponse.json({ error: "Admin access required for scope=all" }, { status: 403 });
  }

  const result = await runAlertDeliveryJob({
    scope,
    userId: scope === "all" ? undefined : session.user.id
  });

  return NextResponse.json(result);
}
