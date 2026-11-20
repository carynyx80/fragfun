import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env, adminWallets } from "@/lib/env";
import { q1 } from "@/lib/db";

export const SESSION_COOKIE = "ff_session";

export interface SessionUser {
  id: string;
  wallet: string;
  role: "user" | "admin";
  status: "active" | "suspended";
  isAdmin: boolean;
}

function key() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function createSessionToken(userId: string, wallet: string) {
  const ttl = env().SESSION_TTL_HOURS;
  return new SignJWT({ wallet })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer("fragfun")
    .setAudience("fragfun-web")
    .setExpirationTime(`${ttl}h`)
    .sign(key());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env().SESSION_TTL_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Resolve the signed-in user from the session cookie. The wallet address comes from the
 * signed JWT and is re-checked against the database — never from request input.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { issuer: "fragfun", audience: "fragfun-web" });
    if (!payload.sub || typeof payload.wallet !== "string") return null;
    const row = await q1<{ id: string; wallet_address: string; role: "user" | "admin"; status: "active" | "suspended" }>(
      "select id, wallet_address, role, status from users where id = $1",
      [payload.sub],
    );
    if (!row || row.wallet_address !== payload.wallet) return null;
    const isAdmin = row.role === "admin" || adminWallets().has(row.wallet_address);
    return { id: row.id, wallet: row.wallet_address, role: row.role, status: row.status, isAdmin };
  } catch {
    return null;
  }
}
