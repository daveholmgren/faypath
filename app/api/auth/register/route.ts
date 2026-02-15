import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  clientIdentifierFromRequest,
  consumeRateLimit,
  rateLimitHeaders,
  type RateLimitResult
} from "@/lib/rate-limit";

function jsonWithThrottle(body: unknown, throttle: RateLimitResult, status = 200) {
  const response = NextResponse.json(body, { status });
  const headers = rateLimitHeaders(throttle);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

const blockedDomains = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com"
]);

export async function POST(req: Request) {
  const throttle = consumeRateLimit({
    namespace: "auth:register",
    identifier: clientIdentifierFromRequest(req),
    limit: 10,
    windowMs: 60_000
  });
  if (!throttle.allowed) {
    return jsonWithThrottle(
      { error: "Too many registration attempts. Try again in a minute." },
      throttle,
      429
    );
  }

  const body = (await req.json()) as {
    name?: string;
    email?: string;
    password?: string;
    role?: "candidate" | "employer";
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "employer" ? "EMPLOYER" : "CANDIDATE";

  if (!name || !email || !password) {
    return jsonWithThrottle({ error: "name, email, and password are required" }, throttle, 400);
  }

  if (name.length < 2 || name.length > 80) {
    return jsonWithThrottle(
      { error: "name must be between 2 and 80 characters" },
      throttle,
      400
    );
  }

  if (password.length < 10) {
    return jsonWithThrottle(
      { error: "password must be at least 10 characters" },
      throttle,
      400
    );
  }

  const emailDomain = email.split("@")[1] ?? "";
  if (!emailDomain || blockedDomains.has(emailDomain)) {
    return jsonWithThrottle(
      { error: "Please use a non-disposable email domain." },
      throttle,
      400
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return jsonWithThrottle({ error: "email already in use" }, throttle, 409);
  }

  const sourceIp = clientIdentifierFromRequest(req);
  const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;

  const passwordHash = await hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      lastSignUpIp: sourceIp,
      lastSignUpUserAgent: userAgent
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });

  return jsonWithThrottle(created, throttle, 201);
}
