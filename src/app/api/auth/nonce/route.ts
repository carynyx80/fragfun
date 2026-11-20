import { randomBytes } from "node:crypto";
import { z } from "zod";
import { route, parseJson, limit, err } from "@/lib/api";
import { env } from "@/lib/env";
import { q } from "@/lib/db";
import { buildSignInMessage, isValidWalletAddress } from "@/lib/auth/siws";

const Body = z.object({ wallet: z.string().min(32).max(44) });

/** Issue a single-use, short-lived nonce and the exact message the wallet must sign. */
export const POST = route(async (req) => {
  limit(req, "auth-nonce", 20, 60_000);
  const { wallet } = await parseJson(req, Body);
  if (!isValidWalletAddress(wallet)) throw err.badRequest("That is not a valid Solana wallet address.");
  const e = env();
  // The signed message is bound to the configured public origin (APP_URL), never to request headers,
  // so it stays correct behind proxies (Vercel → Railway) and cannot be spoofed with a Host header.
  const app = new URL(e.APP_URL);
  const host = app.host;
  const proto = app.protocol.replace(":", "");
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60_000);
  const message = buildSignInMessage({
    domain: host,
    wallet,
    uri: `${proto}://${host}`,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expirationTime: expiresAt.toISOString(),
    network: e.SOLANA_NETWORK,
  });
  await q("delete from auth_nonces where expires_at < now() - interval '1 hour'");
  await q("insert into auth_nonces (nonce, wallet_address, message, expires_at) values ($1, $2, $3, $4)", [
    nonce,
    wallet,
    message,
    expiresAt.toISOString(),
  ]);
  return { message, nonce, expiresAt: expiresAt.toISOString() };
});
