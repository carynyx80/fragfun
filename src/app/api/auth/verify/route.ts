import { z } from "zod";
import { route, parseJson, limit, err, requestOrigin } from "@/lib/api";
import { env } from "@/lib/env";
import { tx } from "@/lib/db";
import { checkSignIn } from "@/lib/auth/siws";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

const Body = z.object({
  wallet: z.string().min(32).max(44),
  message: z.string().min(10).max(2000),
  signature: z.string().min(64).max(100),
});

const REASONS: Record<string, string> = {
  malformed_message: "The signed message was not recognised. Please try again.",
  wallet_mismatch: "The signature does not belong to the connected wallet.",
  domain_mismatch: "This sign-in request was created for a different site.",
  network_mismatch: "This sign-in request was created for a different network.",
  expired: "The sign-in request expired. Please try again.",
  bad_signature: "The wallet signature could not be verified.",
};

export const POST = route(async (req) => {
  limit(req, "auth-verify", 20, 60_000);
  const body = await parseJson(req, Body);
  const host = requestOrigin(req).host;
  const check = checkSignIn({
    message: body.message,
    signature: body.signature,
    wallet: body.wallet,
    expectedDomain: host,
    expectedNetwork: env().SOLANA_NETWORK,
  });
  if (!check.ok) throw err.badRequest(REASONS[check.reason], check.reason);

  const user = await tx(async (db) => {
    // Consume the nonce atomically: it must exist, belong to this wallet, match the exact message,
    // be unexpired and unused. A replayed signature fails here.
    const consumed = await db.query<{ nonce: string }>(
      `update auth_nonces set used_at = now()
        where nonce = $1 and wallet_address = $2 and message = $3 and used_at is null and expires_at > now()
        returning nonce`,
      [check.fields.nonce, body.wallet, body.message],
    );
    if (consumed.length !== 1) throw err.badRequest("This sign-in request is invalid or was already used.", "nonce_invalid");
    const rows = await db.query<{ id: string; status: string }>(
      `insert into users (wallet_address) values ($1)
       on conflict (wallet_address) do update set wallet_address = excluded.wallet_address
       returning id, status`,
      [body.wallet],
    );
    await db.query("insert into creator_profiles (user_id) values ($1) on conflict do nothing", [rows[0].id]);
    return rows[0];
  });
  if (user.status === "suspended") throw err.forbidden("This account is suspended.");
  await setSessionCookie(await createSessionToken(user.id, body.wallet));
  return { ok: true, userId: user.id, wallet: body.wallet };
});
