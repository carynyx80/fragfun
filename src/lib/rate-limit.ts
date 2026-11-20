/**
 * Fixed-window rate limiter.
 * In-memory: effective per server instance. On multi-instance deployments this is a first line of
 * defence; the database unique constraints (views, likes, votes, launches) are the real guarantees.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 50_000) sweep(now);
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  b.count += 1;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), resetAt: b.resetAt };
}

function sweep(now: number) {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export function _resetRateLimits() {
  buckets.clear();
}
