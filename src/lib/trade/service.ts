import "server-only";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { env } from "@/lib/env";
import { q, q1 } from "@/lib/db";
import { err } from "@/lib/api";
import { notify } from "@/lib/log";
import { rpc, withRpc } from "@/lib/solana/connection";
import { chooseFeePayer, cosignAsFeePayer } from "@/lib/solana/company";
import { buildTradeTransaction, TradeUnavailableError, TOKEN_DECIMALS, fetchBalances } from "@/lib/solana/pump-core";
import { inspectPreparedTransaction, messageHash, verifySignedMatchesPrepared } from "@/lib/solana/tx-guard";
import { isBlockhashExpired } from "@/lib/solana/verify-launch";
import { toBaseUnits, fromBaseUnits } from "@/lib/validation";

interface IntentRow {
  id: string;
  user_id: string;
  token_id: string;
  side: "buy" | "sell";
  venue: string;
  message_hash: string;
  last_valid_block_height: string | number;
  transaction_signature: string | null;
  signed_tx_base64: string | null;
  status: "prepared" | "submitted" | "confirmed" | "failed" | "expired" | "unknown";
  error_message: string | null;
  fee_payer: string | null;
  updated_at: string;
}

async function confirmedToken(mint: string) {
  const t = await q1<{ id: string; symbol: string; clip_id: string }>(
    "select id, symbol, clip_id from tokens where mint_address = $1 and launch_status = 'confirmed'",
    [mint],
  );
  if (!t) throw err.notFound("Only tokens launched through Fragfun can be traded here.");
  return t;
}

export async function prepareTrade(
  user: { id: string; wallet: string },
  input: { mint: string; side: "buy" | "sell"; amount: string; slippageBps: number },
) {
  if (!env().FEATURE_TRADING) throw err.unavailable("Trading is temporarily disabled.", "trading_disabled");
  const token = await confirmedToken(input.mint);
  let amount: bigint;
  try {
    amount = toBaseUnits(input.amount, input.side === "buy" ? 9 : TOKEN_DECIMALS);
  } catch (e) {
    throw err.badRequest(e instanceof Error ? e.message : "Invalid amount.");
  }
  if (amount <= 0n) throw err.badRequest("Enter an amount greater than zero.");
  const payer = new PublicKey(user.wallet);
  const { feePayer, sponsored } = await chooseFeePayer(user);
  let built;
  try {
    built = await withRpc((c) =>
      buildTradeTransaction(c, {
        mint: new PublicKey(input.mint),
        user: payer,
        side: input.side,
        amount,
        slippageBps: input.slippageBps,
        priorityMicroLamports: env().PRIORITY_FEE_MICROLAMPORTS,
        feePayer: new PublicKey(feePayer),
      }),
    );
  } catch (e) {
    if (e instanceof TradeUnavailableError) throw err.conflict(e.message, `trade_${e.code}`);
    throw e;
  }
  const guard = inspectPreparedTransaction(built.tx, user.wallet, sponsored ? { sponsor: feePayer } : {});
  if (!guard.ok) throw err.unavailable("Could not prepare a safe trade transaction.");

  // Balance checks and simulation so users see problems before signing.
  const balances = await withRpc((c) => fetchBalances(c, payer, new PublicKey(input.mint)));
  if (input.side === "sell" && BigInt(balances.tokenAmount ?? "0") < amount)
    throw err.badRequest("You do not have enough tokens for this sale.", "insufficient_tokens");
  if (input.side === "buy" && BigInt(balances.lamports) < amount)
    throw err.badRequest("You do not have enough SOL for this purchase.", "insufficient_sol");
  const sim = await rpc().simulateTransaction(built.tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).join(" ");
    const reason = /insufficient|0x1\b/i.test(logs)
      ? "Insufficient SOL for this trade including fees and account rent."
      : /slippage|TooMuchSolRequired|TooLittleSolReceived|ExceededSlippage/i.test(logs)
        ? "Price moved beyond your slippage tolerance. Increase slippage or reduce the amount."
        : "This trade failed simulation. Nothing was submitted.";
    throw err.badRequest(reason, "simulation_failed", { logs: sim.value.logs?.slice(-6) });
  }

  const rows = await q<{ id: string }>(
    `insert into trade_intents (user_id, token_id, side, venue, input_amount, expected_output, limit_amount, slippage_bps,
       message_hash, recent_blockhash, last_valid_block_height, fee_payer)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
    [
      user.id,
      token.id,
      input.side,
      built.quote.venue,
      built.quote.inputAmount,
      built.quote.expectedOutput,
      built.quote.limitAmount,
      input.slippageBps,
      messageHash(built.tx),
      built.blockhash,
      built.lastValidBlockHeight,
      feePayer,
    ],
  );
  const q2 = built.quote;
  return {
    intentId: rows[0].id,
    transaction: Buffer.from(built.tx.serialize()).toString("base64"),
    quote: {
      ...q2,
      inputDisplay: fromBaseUnits(q2.inputAmount, input.side === "buy" ? 9 : TOKEN_DECIMALS),
      expectedOutputDisplay: fromBaseUnits(q2.expectedOutput, input.side === "buy" ? TOKEN_DECIMALS : 9, 6),
      limitDisplay: fromBaseUnits(q2.limitAmount, 9, 6),
    },
    programs: guard.programs,
    networkFeePaidBy: sponsored ? "fragfun" : "you",
    lastValidBlockHeight: built.lastValidBlockHeight,
  };
}

async function getIntent(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw err.notFound();
  const r = await q1<IntentRow>("select * from trade_intents where id = $1 and user_id = $2", [id, userId]);
  if (!r) throw err.notFound("Trade not found.");
  return r;
}

export async function submitTrade(user: { id: string; wallet: string }, intentId: string, signedBase64: string) {
  const i = await getIntent(user.id, intentId);
  if (i.status !== "prepared") return publicIntent(i);
  let signed: VersionedTransaction;
  try {
    signed = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
  } catch {
    throw err.badRequest("Invalid signed transaction.");
  }
  const sponsoredTx = Boolean(i.fee_payer && i.fee_payer !== user.wallet);
  const check = verifySignedMatchesPrepared(signed, i.message_hash, user.wallet, sponsoredTx ? { cosign: cosignAsFeePayer } : {});
  if (!check.ok) throw err.badRequest(check.reason, "tx_mismatch");
  // Atomic status flip prevents duplicate submissions of the same intent.
  const flipped = await q(
    `update trade_intents set status = 'submitted', transaction_signature = $2, signed_tx_base64 = $3, updated_at = now()
      where id = $1 and status = 'prepared' returning id`,
    [i.id, check.signature, Buffer.from(signed.serialize()).toString("base64")],
  );
  if (flipped.length === 0) return publicIntent(await getIntent(user.id, intentId));
  try {
    await rpc().sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/simulation failed|preflight|Blockhash not found/i.test(msg)) {
      await q("update trade_intents set status = 'failed', error_message = $2, updated_at = now() where id = $1", [
        i.id,
        /Blockhash not found/i.test(msg) ? "The quote expired before it was sent. Please get a new quote." : "The network rejected this trade. Nothing was spent.",
      ]);
    } else {
      await q("update trade_intents set status = 'unknown', error_message = $2, updated_at = now() where id = $1", [
        i.id,
        "We could not confirm the broadcast. Checking the network…",
      ]);
    }
  }
  return reconcileTrade(await getIntent(user.id, intentId));
}

export async function tradeStatus(userId: string, intentId: string) {
  return reconcileTrade(await getIntent(userId, intentId));
}

async function reconcileTrade(i: IntentRow) {
  if (!i.transaction_signature || !["submitted", "unknown"].includes(i.status)) return publicIntent(i);
  const conn = rpc();
  const st = (await conn.getSignatureStatuses([i.transaction_signature], { searchTransactionHistory: true }).catch(() => null))?.value[0];
  const token = await q1<{ symbol: string; clip_id: string; mint_address: string }>(
    "select symbol, clip_id, mint_address from tokens where id = $1",
    [i.token_id],
  );
  if (st?.err) {
    await q("update trade_intents set status = 'failed', error_message = $2, updated_at = now() where id = $1", [
      i.id,
      "The trade failed on-chain (often slippage). Only the network fee was charged.",
    ]);
    await notify(i.user_id, "trade_failed", `Your $${token?.symbol} ${i.side} failed`, "The transaction failed on-chain.", `/token/${token?.mint_address}`, `trade-failed:${i.id}`);
  } else if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
    // Record verified balance changes for the trader from the confirmed transaction.
    const txn = await conn
      .getTransaction(i.transaction_signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
      .catch(() => null);
    const user = await q1<{ wallet_address: string }>("select wallet_address from users where id = $1", [i.user_id]);
    let solDelta: string | null = null;
    let tokenDelta: string | null = null;
    if (txn?.meta && user && token) {
      const keys = txn.transaction.message.getAccountKeys({ accountKeysFromLookups: txn.meta.loadedAddresses });
      const idx = keys.staticAccountKeys.findIndex((k) => k.toBase58() === user.wallet_address);
      if (idx >= 0) solDelta = (BigInt(txn.meta.postBalances[idx]) - BigInt(txn.meta.preBalances[idx])).toString();
      const pre = txn.meta.preTokenBalances?.find((b) => b.owner === user.wallet_address && b.mint === token.mint_address);
      const post = txn.meta.postTokenBalances?.find((b) => b.owner === user.wallet_address && b.mint === token.mint_address);
      tokenDelta = (BigInt(post?.uiTokenAmount.amount ?? "0") - BigInt(pre?.uiTokenAmount.amount ?? "0")).toString();
    }
    await q(
      `update trade_intents set status = 'confirmed', sol_delta_lamports = $2, token_delta = $3, error_message = null, updated_at = now() where id = $1`,
      [i.id, solDelta, tokenDelta],
    );
    await notify(i.user_id, "trade_confirmed", `Your $${token?.symbol} ${i.side} confirmed`, null, `/token/${token?.mint_address}`, `trade:${i.id}`);
  } else if (!st) {
    const expired = await withRpc((c) => isBlockhashExpired(c, Number(i.last_valid_block_height))).catch(() => false);
    if (expired) {
      await q("update trade_intents set status = 'expired', error_message = $2, updated_at = now() where id = $1", [
        i.id,
        "The trade was not included before it expired. Nothing was spent.",
      ]);
    } else if (i.signed_tx_base64 && Date.now() - Date.parse(i.updated_at) > 15_000) {
      await conn.sendRawTransaction(Buffer.from(i.signed_tx_base64, "base64"), { skipPreflight: true, maxRetries: 2 }).catch(() => undefined);
    }
  }
  return publicIntent(await q1<IntentRow>("select * from trade_intents where id = $1", [i.id]).then((r) => r!));
}

function publicIntent(i: IntentRow) {
  return { intentId: i.id, status: i.status, signature: i.transaction_signature, side: i.side, venue: i.venue, error: i.error_message };
}
