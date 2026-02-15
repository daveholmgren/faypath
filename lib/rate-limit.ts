type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  namespace: string;
  identifier: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  allowed: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var __faypathRateLimits: Map<string, Map<string, Bucket>> | undefined;
}

function rootStore() {
  if (!globalThis.__faypathRateLimits) {
    globalThis.__faypathRateLimits = new Map<string, Map<string, Bucket>>();
  }
  return globalThis.__faypathRateLimits;
}

function namespaceStore(namespace: string) {
  const root = rootStore();
  let store = root.get(namespace);
  if (!store) {
    store = new Map<string, Bucket>();
    root.set(namespace, store);
  }
  return store;
}

function cleanupExpired(store: Map<string, Bucket>, now: number) {
  if (store.size < 500) return;
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function consumeRateLimit(input: {
  namespace: string;
  identifier: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const limit = Math.max(1, Math.floor(input.limit));
  const windowMs = Math.max(1000, Math.floor(input.windowMs));
  const identifier = input.identifier.trim() || "unknown";
  const now = Date.now();

  const store = namespaceStore(input.namespace);
  cleanupExpired(store, now);

  const existing = store.get(identifier);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(identifier, {
      count: 1,
      resetAt
    });
    return {
      namespace: input.namespace,
      identifier,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
      allowed: true
    };
  }

  if (existing.count >= limit) {
    return {
      namespace: input.namespace,
      identifier,
      limit,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      allowed: false
    };
  }

  existing.count += 1;
  return {
    namespace: input.namespace,
    identifier,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    allowed: true
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    "Retry-After": String(result.retryAfterSeconds)
  };
}

function parseClientAddress(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    if (first) return first;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp?.trim()) return cfIp.trim();

  return "unknown";
}

export function clientIdentifierFromRequest(req: Request) {
  const ip = parseClientAddress(req);
  if (ip !== "unknown") return ip;

  const userAgent = req.headers.get("user-agent")?.trim();
  if (userAgent) return `ua:${userAgent.slice(0, 80)}`;

  return "unknown";
}
