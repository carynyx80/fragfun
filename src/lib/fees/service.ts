import "server-only";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { PUMP_SDK, bondingCurvePda, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import { env } from "@/lib/env";
import { q, q1 } from "@/lib/db";
import { err } from "@/lib/api";
import { logEvent, notify } from "@/lib/log";
import { rpc, withRpc } from "@/lib/solana/connection";
import { buildClaimTransaction, buildFeeShareTransaction, fetchCreatorFeeState, type CreatorFeeState } from "@/lib/solana/pump-core";
import { inspectPreparedTransaction, messageHash, verifySignedMatchesPrepared } from "@/lib/solana/tx-guard";
import { isBlockhashExpired } from "@/lib/solana/verify-launch";

/**
 * Creator fees.
 * - New launches: a second transaction sets the coin's Pump fee-sharing split
 *   (creator = 10,000 − PLATFORM_CREATOR_FEE_BPS, company wallet = PLATFORM_CREATOR_FEE_BPS). Locked on-chain.
 * - Claims: for split coins, distribute the coin's fees to every shareholder (permissionless, the creator
 *   pays the network fee); for coins without a split, collect the creator's own Pump creator vault.
 * Every transaction is built unsigned, passes the guard, and is broadcast only if the signed bytes match.
 */

export function platformSplit(): { platformBps: number; creatorBps: number; recipient: string } | null {
  const e = env();
  if (!e.PLATFORM_CREATOR_FEE_BPS || !e.COMPANY_WALLET_ADDRESS) return null;
  return { platformBps: e.PLATFORM_CREATOR_FEE_BPS, creatorBps: 10_000 - e.PLATFORM_CREATOR_FEE_BPS, recipient: e.COMPANY_WALLET_ADDRESS };
}

interface PreparedRow {
  id: string;
  user_id: string;
  token_id: string | null;
  kind: "fee_share" | "claim";
  message_hash: string;
  last_valid_block_height: string | number;
  signed_tx_base64: string | null;
  transaction_signature: string | null;
  status: string;
  error_message: string | null;
  updated_at: string;
}

interface TokenRow {
  id: string;
  mint_address: string;
  symbol: string;
  clip_id: string;
  creator_id: string;
  launch_status: string;
  fee_share_status: string;
}

async function tokenForCreator(userId: string, mint: string) {
  const t = await q1<TokenRow>(
    "select id, mint_address, symbol, clip_id, creator_id, launch_status, fee_share_status from tokens where mint_address = $1",
    [mint],
  );
  if (!t || t.creator_id !== userId) throw err.forbidden("Only the token's creator can do this.");
  return t;
}

/** Build + store the fee-share setup transaction. `requireConfirmed` is false during launch (curve not created yet). */
export async function prepareFeeShareTx(user: { id: string; wallet: string }, token: { id: string; mint_address: string }) {
  const split = platformSplit();
  if (!split) throw err.unavailable("Creator fee sharing is not configured.");
  const creator = new PublicKey(user.wallet);
  const built = await withRpc((c) =>
    buildFeeShareTransaction(c, {
      mint: new PublicKey(token.mint_address),
      creator,
      shares: [
        { address: creator, shareBps: split.creatorBps },
        { address: new PublicKey(split.recipient), shareBps: split.platformBps },
      ],
      priorityMicroLamports: env().PRIORITY_FEE_MICROLAMPORTS,
    }),
  );
  const guard = inspectPreparedTransaction(built.tx, user.wallet);
  if (!guard.ok) throw err.unavailable("Could not prepare a safe fee-sharing transaction.");
  const rows = await q<{ id: string }>(
    `insert into prepared_txs (user_id, token_id, kind, message_hash, last_valid_block_height, details)
     values ($1, $2, 'fee_share', $3, $4, $5) returning id`,
    [user.id, token.id, messageHash(built.tx), built.lastValidBlockHeight, JSON.stringify(split)],
  );
  await q("update tokens set fee_share_status = case when fee_share_status = 'configured' then fee_share_status else 'pending' end where id = $1", [token.id]);
  return { txId: rows[0].id, transaction: Buffer.from(built.tx.serialize()).toString("base64"), split };
}

export async function prepareFeeShareForMint(user: { id: string; wallet: string }, mint: string) {
  const t = await tokenForCreator(user.id, mint);
  if (t.launch_status !== "confirmed") throw err.conflict("The token launch must be confirmed first.");
  await syncFeeShare(t);
  const fresh = await q1<TokenRow>("select * from tokens where id = $1", [t.id]);
  if (fresh?.fee_share_status === "configured") throw err.conflict("The creator fee split is already set for this token.", "fee_share_configured");
  return prepareFeeShareTx(user, t);
}

export async function prepareClaim(user: { id: string; wallet: string }, mint: string) {
  const t = await tokenForCreator(user.id, mint);
  const built = await withRpc((c) =>
    buildClaimTransaction(c, { mint: new PublicKey(mint), creatorWallet: new PublicKey(user.wallet), priorityMicroLamports: env().PRIORITY_FEE_MICROLAMPORTS }),
  );
  if (!built.state.canClaim) throw err.conflict("There are no creator fees to claim yet.", "nothing_to_claim");
  const guard = inspectPreparedTransaction(built.tx, user.wallet);
  if (!guard.ok) throw err.unavailable("Could not prepare a safe claim transaction.");
  const sim = await rpc().simulateTransaction(built.tx, { sigVerify: false, replaceRecentBlockhash: true });
  if (sim.value.err) throw err.badRequest("The claim failed simulation. Nothing was submitted.", "simulation_failed", { err: sim.value.err });
  const rows = await q<{ id: string }>(
    `insert into prepared_txs (user_id, token_id, kind, message_hash, last_valid_block_height, details)
     values ($1, $2, 'claim', $3, $4, $5) returning id`,
    [user.id, t.id, messageHash(built.tx), built.lastValidBlockHeight, JSON.stringify(built.state)],
  );
  return { txId: rows[0].id, transaction: Buffer.from(built.tx.serialize()).toString("base64"), state: built.state };
}

async function getPrepared(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw err.notFound();
  const r = await q1<PreparedRow>("select * from prepared_txs where id = $1 and user_id = $2", [id, userId]);
  if (!r) throw err.notFound("Transaction not found.");
  return r;
}

/** Store a wallet-signed prepared transaction. Claims are sent immediately; a fee-share tx waits for its launch. */
export async function submitPrepared(user: { id: string; wallet: string }, id: string, signedBase64: string) {
  const p = await getPrepared(user.id, id);
  if (p.status !== "prepared") return publicPrepared(p);
  let signed: VersionedTransaction;
  try {
    signed = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
  } catch {
    throw err.badRequest("Invalid signed transaction.");
  }
  const check = verifySignedMatchesPrepared(signed, p.message_hash, user.wallet);
  if (!check.ok) throw err.badRequest(check.reason, "tx_mismatch");
  const flipped = await q(
    `update prepared_txs set status = 'signed', signed_tx_base64 = $2, transaction_signature = $3, updated_at = now()
      where id = $1 and status = 'prepared' returning id`,
    [p.id, signedBase64, check.signature],
  );
  if (!flipped.length) return publicPrepared(await getPrepared(user.id, id));
  const token = p.token_id ? await q1<TokenRow>("select * from tokens where id = $1", [p.token_id]) : null;
  if (p.kind === "claim" || token?.launch_status === "confirmed") await sendPrepared(await getPrepared(user.id, id));
  return publicPrepared(await getPrepared(user.id, id));
}

async function sendPrepared(p: PreparedRow) {
  if (!p.signed_tx_base64 || p.status !== "signed") return;
  await q("update prepared_txs set status = 'submitted', updated_at = now() where id = $1", [p.id]);
  if (p.kind === "fee_share" && p.token_id) {
    await q("update tokens set fee_share_status = 'submitted', fee_share_signature = $2 where id = $1 and fee_share_status <> 'configured'", [
      p.token_id,
      p.transaction_signature,
    ]);
  }
  try {
    await rpc().sendRawTransaction(Buffer.from(p.signed_tx_base64, "base64"), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/simulation failed|preflight|Blockhash not found/i.test(msg)) {
      const expired = /Blockhash not found/i.test(msg);
      await q("update prepared_txs set status = $2, error_message = $3, updated_at = now() where id = $1", [
        p.id,
        expired ? "expired" : "failed",
        expired ? "The approval expired before it could be sent. Approve it again from your dashboard." : `Rejected by the network: ${msg.slice(0, 200)}`,
      ]);
      if (p.kind === "fee_share" && p.token_id) await q("update tokens set fee_share_status = 'pending' where id = $1 and fee_share_status <> 'configured'", [p.token_id]);
      await logEvent("warn", `fees:${p.kind}`, msg.slice(0, 500), { prepared: p.id });
    } else {
      await q("update prepared_txs set status = 'unknown', error_message = $2, updated_at = now() where id = $1", [p.id, "Checking the network…"]);
    }
  }
}

/** Called by the launch reconciler right after a launch is verified on-chain. */
export async function sendPendingFeeShare(tokenId: string) {
  const rows = await q<PreparedRow>(
    "select * from prepared_txs where token_id = $1 and kind = 'fee_share' and status = 'signed' order by created_at desc limit 1",
    [tokenId],
  );
  if (rows[0]) await sendPrepared(rows[0]);
}

export async function preparedStatus(userId: string, id: string) {
  return publicPrepared(await reconcilePrepared(await getPrepared(userId, id)));
}

async function reconcilePrepared(p: PreparedRow): Promise<PreparedRow> {
  if (!p.transaction_signature || !["submitted", "unknown"].includes(p.status)) return p;
  const st = (await rpc().getSignatureStatuses([p.transaction_signature], { searchTransactionHistory: true }).catch(() => null))?.value[0];
  if (st?.err) {
    await q("update prepared_txs set status = 'failed', error_message = $2, updated_at = now() where id = $1", [p.id, `Failed on-chain: ${JSON.stringify(st.err)}`]);
    if (p.kind === "fee_share" && p.token_id) await q("update tokens set fee_share_status = 'failed' where id = $1 and fee_share_status <> 'configured'", [p.token_id]);
  } else if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
    await q("update prepared_txs set status = 'confirmed', error_message = null, updated_at = now() where id = $1", [p.id]);
    if (p.token_id) {
      const t = await q1<TokenRow>("select * from tokens where id = $1", [p.token_id]);
      if (t && p.kind === "fee_share") {
        await syncFeeShare(t);
        await notify(t.creator_id, "launch_confirmed", `Creator fee split active for $${t.symbol}`, "Fees from every trade now split automatically.", `/token/${t.mint_address}`, `feeshare:${p.id}`);
      }
      if (t && p.kind === "claim") await notify(t.creator_id, "trade_confirmed", `Creator fees claimed for $${t.symbol}`, null, `/token/${t.mint_address}`, `claim:${p.id}`);
    }
  } else if (!st) {
    const expired = await withRpc((c) => isBlockhashExpired(c, Number(p.last_valid_block_height))).catch(() => false);
    if (expired) {
      await q("update prepared_txs set status = 'expired', error_message = $2, updated_at = now() where id = $1", [p.id, "Not included before it expired. Nothing was spent."]);
      if (p.kind === "fee_share" && p.token_id) await q("update tokens set fee_share_status = 'pending' where id = $1 and fee_share_status <> 'configured'", [p.token_id]);
    } else if (p.signed_tx_base64 && Date.now() - Date.parse(p.updated_at) > 15_000) {
      await rpc().sendRawTransaction(Buffer.from(p.signed_tx_base64, "base64"), { skipPreflight: true, maxRetries: 2 }).catch(() => undefined);
    }
  }
  return (await q1<PreparedRow>("select * from prepared_txs where id = $1", [p.id]))!;
}

/** On-chain truth for a token's split: the coin's creator is its sharing-config PDA with the expected company share. */
export async function syncFeeShare(t: { id: string; mint_address: string }) {
  const mint = new PublicKey(t.mint_address);
  const curve = await withRpc((c) => c.getAccountInfo(bondingCurvePda(mint))).catch(() => null);
  if (!curve || curve.data.length < 49) return;
  const bc = PUMP_SDK.decodeBondingCurve(curve);
  const pda = feeSharingConfigPda(mint);
  if (!bc.creator.equals(pda)) return;
  const cfgInfo = await withRpc((c) => c.getAccountInfo(pda)).catch(() => null);
  if (!cfgInfo) return;
  const cfg = PUMP_SDK.decodeSharingConfig(cfgInfo);
  const company = env().COMPANY_WALLET_ADDRESS;
  const companyShare = cfg.shareholders.find((s) => s.address.toBase58() === company)?.shareBps ?? 0;
  await q("update tokens set fee_share_status = 'configured', fee_share_platform_bps = $2 where id = $1", [t.id, companyShare]);
}

const feeCache = new Map<string, { at: number; value: CreatorFeeState }>();

/** Creator dashboard: each of the creator's confirmed tokens with its split status and claimable fees. */
export async function creatorFeesForUser(user: { id: string; wallet: string }) {
  const tokens = await q<TokenRow & { name: string; image_url: string; fee_share_platform_bps: number | null }>(
    `select id, mint_address, symbol, name, image_url, clip_id, creator_id, launch_status, fee_share_status, fee_share_platform_bps
       from tokens where creator_id = $1 and launch_status = 'confirmed' order by confirmed_at desc limit 20`,
    [user.id],
  );
  const out = [];
  for (const t of tokens) {
    if (t.fee_share_status !== "configured" && t.fee_share_status !== "not_applicable") await syncFeeShare(t).catch(() => undefined);
    const hit = feeCache.get(t.mint_address);
    let state: CreatorFeeState | null = hit && Date.now() - hit.at < 30_000 ? hit.value : null;
    if (!state) {
      state = await withRpc((c) => fetchCreatorFeeState(c, new PublicKey(t.mint_address), new PublicKey(user.wallet))).catch(() => null);
      if (state) feeCache.set(t.mint_address, { at: Date.now(), value: state });
    }
    const fresh = await q1<{ fee_share_status: string; fee_share_platform_bps: number | null }>(
      "select fee_share_status, fee_share_platform_bps from tokens where id = $1",
      [t.id],
    );
    out.push({
      mint: t.mint_address,
      symbol: t.symbol,
      name: t.name,
      imageUrl: t.image_url,
      clipId: t.clip_id,
      feeShareStatus: fresh?.fee_share_status ?? t.fee_share_status,
      platformBps: fresh?.fee_share_platform_bps ?? null,
      state,
    });
  }
  return { split: platformSplit(), tokens: out };
}

function publicPrepared(p: PreparedRow) {
  return { txId: p.id, kind: p.kind, status: p.status, signature: p.transaction_signature, error: p.error_message };
}
