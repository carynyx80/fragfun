import "server-only";
import type { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { env } from "@/lib/env";
import { q1 } from "@/lib/db";
import { loadCompanySigner, parseCompanyAddress } from "./company-core";

/**
 * Server-side access to the company wallet.
 * - The public address is used for treasury balance tracking and as the optional fee payer.
 * - The signer is only loaded when fee sponsorship is enabled. It is held in memory, never
 *   logged, never serialised into a response, and only ever signs transactions whose company
 *   role is limited to paying the network fee (enforced by the transaction guard).
 */

export function companyWallet(): PublicKey | null {
  const addr = env().COMPANY_WALLET_ADDRESS;
  if (!addr) return null;
  const parsed = parseCompanyAddress(addr);
  if (!parsed.ok) throw new Error(`COMPANY_WALLET_ADDRESS invalid: ${parsed.reason}`);
  return parsed.key;
}

const g = globalThis as unknown as { __ffCompanySigner?: Keypair };

function signer(): Keypair {
  if (!g.__ffCompanySigner) {
    const e = env();
    g.__ffCompanySigner = loadCompanySigner(e.COMPANY_SIGNER_SECRET_KEY, e.COMPANY_WALLET_ADDRESS);
  }
  return g.__ffCompanySigner;
}

export function sponsorshipEnabled(): boolean {
  const e = env();
  return e.FEATURE_FEE_SPONSORSHIP && Boolean(e.COMPANY_WALLET_ADDRESS && e.COMPANY_SIGNER_SECRET_KEY);
}

/**
 * Decide who pays the network fee for a new transaction. Sponsorship applies only when enabled
 * and within the configured daily limits; otherwise the user pays, exactly as before.
 */
export async function chooseFeePayer(user: { id: string; wallet: string }): Promise<{ feePayer: string; sponsored: boolean }> {
  if (!sponsorshipEnabled()) return { feePayer: user.wallet, sponsored: false };
  const e = env();
  const counts = await q1<{ total: number; mine: number }>(
    `select
       ((select count(*) from token_launch_attempts where fee_payer = $1 and created_at > now() - interval '24 hours')
      + (select count(*) from trade_intents where fee_payer = $1 and created_at > now() - interval '24 hours'))::int as total,
       ((select count(*) from token_launch_attempts where fee_payer = $1 and creator_id = $2 and created_at > now() - interval '24 hours')
      + (select count(*) from trade_intents where fee_payer = $1 and user_id = $2 and created_at > now() - interval '24 hours'))::int as mine`,
    [e.COMPANY_WALLET_ADDRESS, user.id],
  );
  if ((counts?.total ?? 0) >= e.SPONSOR_MAX_TX_PER_DAY || (counts?.mine ?? 0) >= e.SPONSOR_MAX_TX_PER_USER_PER_DAY)
    return { feePayer: user.wallet, sponsored: false };
  return { feePayer: e.COMPANY_WALLET_ADDRESS, sponsored: true };
}

/** Add the company fee-payer signature. Caller must already have verified the user's signature. */
export function cosignAsFeePayer(tx: VersionedTransaction) {
  const kp = signer();
  if (!tx.message.staticAccountKeys[0]?.equals(kp.publicKey)) throw new Error("Company wallet is not the fee payer of this transaction");
  tx.sign([kp]);
}

/** Validate signer configuration at startup/health time without exposing anything. */
export function companySignerStatus(): "not_configured" | "ok" | "invalid" {
  const e = env();
  if (!e.COMPANY_SIGNER_SECRET_KEY) return "not_configured";
  try {
    signer();
    return "ok";
  } catch {
    return "invalid";
  }
}
