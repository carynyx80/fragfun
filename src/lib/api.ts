import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, connection, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError, type ZodType } from "zod";
import { env } from "@/lib/env";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/log";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const err = {
  badRequest: (m: string, code = "bad_request", details?: unknown) => new ApiError(400, code, m, details),
  unauthorized: (m = "Connect and sign in with your wallet first.") => new ApiError(401, "unauthorized", m),
  forbidden: (m = "You do not have permission to do that.") => new ApiError(403, "forbidden", m),
  notFound: (m = "Not found.") => new ApiError(404, "not_found", m),
  conflict: (m: string, code = "conflict") => new ApiError(409, code, m),
  tooMany: () => new ApiError(429, "rate_limited", "Too many requests. Please slow down and try again shortly."),
  unavailable: (m: string, code = "unavailable") => new ApiError(503, code, m),
};

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler with origin checks, error mapping and logging. */
export function route<P = Record<string, string>>(
  fn: (req: NextRequest, ctx: Ctx<P>) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    // API responses are always computed per request (never prerendered at build time).
    await connection();
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      unstable_rethrow(e); // let Next.js internal control-flow errors propagate
      return toErrorResponse(e, req);
    }
  };
}

export function toErrorResponse(e: unknown, req?: NextRequest) {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const issues = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json(
      { error: { code: "validation_error", message: issues[0]?.message ?? "Invalid input.", details: issues } },
      { status: 400 },
    );
  }
  const message = e instanceof Error ? e.message : String(e);
  console.error("[api]", req?.method, req?.nextUrl.pathname, e);
  void logEvent("error", `api:${req?.nextUrl.pathname ?? "unknown"}`, message);
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong on our side. Please try again." } },
    { status: 500 },
  );
}

/** CSRF protection for cookie-authenticated mutations: the Origin must match this site. */
export function assertSameOrigin(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/webhooks/")) return; // signature-verified instead
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin) {
    // Browsers always send Origin on cross-site POST/PUT/DELETE; allow same-site tools in dev only.
    if (env().NODE_ENV !== "production") return;
    throw err.forbidden("Missing Origin header.");
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw err.forbidden("Invalid Origin header.");
  }
  const allowed = new Set([host, new URL(env().APP_URL).host].filter(Boolean));
  if (!allowed.has(originHost)) throw err.forbidden("Cross-site request blocked.");
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw err.unauthorized();
  if (user.status === "suspended") throw err.forbidden("This account is suspended.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) throw err.forbidden();
  return user;
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw err.badRequest("Request body must be valid JSON.");
  }
  return schema.parse(body);
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Privacy-conscious visitor id: salted daily hash of IP + user agent. Raw IPs are never stored. */
export function visitorKey(req: NextRequest, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const day = new Date().toISOString().slice(0, 10);
  const ua = req.headers.get("user-agent") ?? "";
  return (
    "v:" +
    createHash("sha256")
      .update(`${env().SESSION_SECRET}|${day}|${clientIp(req)}|${ua}`)
      .digest("hex")
      .slice(0, 32)
  );
}

export function limit(req: NextRequest, name: string, max: number, windowMs: number, id?: string) {
  const res = rateLimit(`${name}:${id ?? clientIp(req)}`, max, windowMs);
  if (!res.ok) throw err.tooMany();
}
