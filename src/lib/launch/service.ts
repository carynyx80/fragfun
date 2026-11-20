import "server-only";
import { PublicKey, VersionedTransaction, type Connection } from "@solana/web3.js";
import { env } from "@/lib/env";
import { q, q1, tx } from "@/lib/db";
import { err } from "@/lib/api";
import { logEvent, notify } from "@/lib/log";
import { withRpc, rpc } from "@/lib/solana/connection";
import { chooseFeePayer, cosignAsFeePayer } from "@/lib/solana/company";
import { buildLaunchTransaction, LAMPORTS_PER_SOL } from "@/lib/solana/pump-core";
import { inspectPreparedTransaction, messageHash, verifySignedMatchesPrepared } from "@/lib/solana/tx-guard";
import { isBlockhashExpired, verifyLaunch } from "@/lib/solana/verify-launch";
import { buildMetadata, storeMetadataJson, storeTokenImage } from "@/lib/storage/metadata";
import { readLocalPublicFile, sniffImage } from "@/lib/storage";
import { transition, type LaunchStatus } from "./state";
import type { z } from "zod";
import type { prepareLaunchSchema } from "@/lib/validation";

type PrepareInput = z.infer<typeof prepareLaunchSchema>;

interface AttemptRow {
  id: string;
  creator_id: string;
  token_id: string;
  status: LaunchStatus;
  message_hash: string | null;
  unsigned_tx_base64: string | null;
  signed_tx_base64: string | null;
  recent_blockhash: string | null;
  last_valid_block_height: string | number | null;
  transaction_signature: string | null;
  dev_buy_lamports: string | number;
  error_code: string | null;
  error_message: string | null;
  fee_payer: string | null;
  created_at: string;
  updated_at: string;
}

async function loadImageBytes(url: string): Promise<{ bytes: Uint8Array; type: string }> {
  const app = env().APP_URL;
  let bytes: Uint8Array;
  if (url.startsWith(`${app}/api/files/`)) {
    bytes = await readLocalPublicFile(url.slice(`${app}/api/files/`.length));
  } else {
    const allowed = ["https://image.mux.com/", env().SUPABASE_URL ? `${env().SUPABASE_URL}/storage/v1/object/public/` : null, env().PINATA_GATEWAY].filter(
      Boolean,
    ) as string[];
    if (!allowed.some((a) => url.startsWith(a))) throw err.badRequest("Image must be uploaded through Fragfun.");
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw err.badRequest("Could not load the token image.");
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  const type = sniffImage(bytes);
  if (!type) throw err.badRequest("Token image must be PNG, JPEG, WebP or GIF.");
  if (bytes.length > 4 * 1024 * 1024) throw err.badRequest("Token image must be 4 MB or smaller.");
  return { bytes, type };
}

/** Simulate with the payer's post-state to learn the exact SOL the launch will cost. */
async function simulateCost(conn: Connection, txn: VersionedTransaction, payer: PublicKey) {
  const [pre, sim] = await Promise.all([
    conn.getBalance(payer, "confirmed"),
    conn.simulateTransaction(txn, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
      accounts: { encoding: "base64", addresses: [payer.toBase58()] },
    }),
  ]);
  const post = sim.value.accounts?.[0]?.lamports ?? null;
  return { pre, post, err: sim.value.err, logs: sim.value.logs ?? [], units: sim.value.unitsConsumed ?? null };
}

function explainSimulation(errValue: unknown, logs: string[]): string {
  const text = `${JSON.stringify(errValue)} ${logs.join(" ")}`;
  if (/insufficient lamports|InsufficientFunds|0x1\b|insufficient funds/i.test(text))
    return "Your wallet does not have enough SOL for this launch (rent, network fees and any initial buy).";
  if (/AccountNotFound|could not find account/i.test(text)) return "Your wallet has no SOL on this network yet.";
  if (/already in use/i.test(text)) return "This mint address is already in use. Please try again.";
  return "The launch transaction failed simulation. Nothing was submitted. Please try again.";
}

export async function prepareLaunch(user: { id: string; wallet: string }, input: PrepareInput) {
  const e = env();
  if (!e.FEATURE_LAUNCHES) throw err.unavailable("Launches are temporarily disabled.", "launches_disabled");
  // Mainnet tokens must reference permanent, IPFS-pinned metadata — never a URL on this server.
  if (e.SOLANA_NETWORK === "mainnet-beta" && e.METADATA_PROVIDER !== "pinata")
    throw err.unavailable("Mainnet launches are disabled until IPFS metadata storage (Pinata) is configured.", "metadata_storage_required");

  // Idempotency: the same key returns the same prepared attempt.
  const existing = await q1<AttemptRow>(
    "select * from token_launch_attempts where creator_id = $1 and idempotency_key = $2",
    [user.id, input.idempotencyKey],
  );
  if (existing) return attemptPayload(existing);

  const clip = await q1<{ id: string; thumbnail_url: string | null; processing_status: string; moderation_status: string }>(
    "select id, thumbnail_url, processing_status, moderation_status from clips where id = $1 and creator_id = $2",
    [input.clipId, user.id],
  );
  if (!clip) throw err.notFound("Clip not found.");
  if (clip.processing_status !== "ready") throw err.conflict("Your clip is still processing. Launch once it is ready.", "clip_not_ready");
  if (clip.moderation_status === "rejected" || clip.moderation_status === "removed")
    throw err.forbidden("This clip cannot be launched.");

  await expireAbandonedAttempts(input.clipId);
  const active = await q1<{ launch_status: string; mint_address: string }>(
    "select launch_status, mint_address from tokens where clip_id = $1 and launch_status <> 'failed'",
    [input.clipId],
  );
  if (active?.launch_status === "confirmed") throw err.conflict("This clip already has a token.", "already_launched");
  if (active) throw err.conflict("A launch for this clip is already in progress.", "launch_in_progress");

  let mint: PublicKey;
  try {
    mint = new PublicKey(input.mint);
  } catch {
    throw err.badRequest("Invalid mint address.");
  }
  const devBuyLamports = BigInt(Math.round(input.devBuySol * LAMPORTS_PER_SOL));
  if (input.devBuySol > e.LAUNCH_MAX_DEV_BUY_SOL)
    throw err.badRequest(`Initial buy is limited to ${e.LAUNCH_MAX_DEV_BUY_SOL} SOL.`);

  const mintInfo = await withRpc((c) => c.getAccountInfo(mint));
  if (mintInfo) throw err.conflict("This mint address already exists on-chain. Please retry.", "mint_exists");

  // Image + metadata
  const imageSourceUrl = input.imageSource === "thumbnail" ? clip.thumbnail_url : input.imageUrl;
  if (!imageSourceUrl) throw err.badRequest("Choose a token image.");
  const img = await loadImageBytes(imageSourceUrl);
  const ext = img.type.split("/")[1].replace("jpeg", "jpg");
  const imageUrl = await storeTokenImage(`tokens/${mint.toBase58()}/image.${ext}`, img.bytes, img.type);
  const clipUrl = `${e.APP_URL}/clip/${input.clipId}`;
  const metadata = buildMetadata({
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: imageUrl,
    twitter: input.twitter,
    telegram: input.telegram,
    website: input.website,
    clipUrl,
  });
  const metadataUri = await storeMetadataJson(`tokens/${mint.toBase58()}/metadata.json`, metadata);

  // Build + inspect + simulate
  const payer = new PublicKey(user.wallet);
  const { feePayer, sponsored } = await chooseFeePayer(user);
  const built = await withRpc((c) =>
    buildLaunchTransaction(c, {
      mint,
      user: payer,
      name: input.name,
      symbol: input.symbol,
      uri: metadataUri,
      devBuyLamports,
      priorityMicroLamports: e.PRIORITY_FEE_MICROLAMPORTS,
      feePayer: new PublicKey(feePayer),
    }),
  );
  const guard = inspectPreparedTransaction(built.tx, user.wallet, sponsored ? { sponsor: feePayer } : {});
  if (!guard.ok) {
    await logEvent("error", "launch:guard", "Prepared launch failed guard", { problems: guard.problems });
    throw err.unavailable("Could not prepare a safe launch transaction.");
  }
  const sim = await simulateCost(rpc(), built.tx, payer);
  if (sim.pre === 0 && !sponsored)
    throw err.badRequest("Your wallet has no SOL on this network. Add SOL to cover rent and network fees, then try again.", "simulation_failed", {
      balanceLamports: 0,
    });
  if (sim.err)
    throw err.badRequest(explainSimulation(sim.err, sim.logs), "simulation_failed", { err: sim.err, logs: sim.logs.slice(-8) });
  const costLamports = sim.post !== null ? sim.pre - sim.post : null;

  const unsigned = Buffer.from(built.tx.serialize()).toString("base64");
  const hash = messageHash(built.tx);
  const row = await tx(async (db) => {
    const t = await db.query<{ id: string }>(
      `insert into tokens (clip_id, creator_id, mint_address, name, symbol, description, image_url, metadata_uri,
         twitter, telegram, website, launch_status, token_program)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'awaiting_signature',$12) returning id`,
      [
        input.clipId,
        user.id,
        mint.toBase58(),
        input.name,
        input.symbol,
        input.description,
        imageUrl,
        metadataUri,
        input.twitter ?? null,
        input.telegram ?? null,
        input.website ?? null,
        "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      ],
    );
    const a = await db.query<AttemptRow>(
      `insert into token_launch_attempts (creator_id, token_id, idempotency_key, status, message_hash, unsigned_tx_base64,
         recent_blockhash, last_valid_block_height, dev_buy_lamports, fee_payer)
       values ($1,$2,$3,'awaiting_signature',$4,$5,$6,$7,$8,$9) returning *`,
      [user.id, t[0].id, input.idempotencyKey, hash, unsigned, built.blockhash, built.lastValidBlockHeight, devBuyLamports.toString(), feePayer],
    );
    return a[0];
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/tokens_one_active_per_clip|duplicate key/i.test(msg))
      throw err.conflict("A launch for this clip is already in progress.", "launch_in_progress");
    throw e;
  });

  return {
    ...(await attemptPayload(row)),
    preview: {
      imageUrl,
      metadataUri,
      expectedTokens: built.expectedTokens,
      fees: built.fees,
      simulatedCostLamports: costLamports,
      walletBalanceLamports: sim.pre,
      computeUnits: sim.units,
      programs: guard.programs,
      networkFeePaidBy: sponsored ? "fragfun" : "you",
    },
  };
}

async function attemptPayload(a: AttemptRow) {
  const token = await q1<{ mint_address: string; name: string; symbol: string; clip_id: string; launch_status: string }>(
    "select mint_address, name, symbol, clip_id, launch_status from tokens where id = $1",
    [a.token_id],
  );
  return {
    attemptId: a.id,
    tokenId: a.token_id,
    status: a.status,
    mint: token?.mint_address ?? null,
    name: token?.name ?? null,
    symbol: token?.symbol ?? null,
    clipId: token?.clip_id ?? null,
    signature: a.transaction_signature,
    transaction: a.status === "awaiting_signature" ? a.unsigned_tx_base64 : null,
    lastValidBlockHeight: a.last_valid_block_height ? Number(a.last_valid_block_height) : null,
    error: a.error_message ? { code: a.error_code, message: a.error_message } : null,
  };
}

async function setStatus(a: AttemptRow, next: LaunchStatus, fields: { code?: string; message?: string; signature?: string; signedTx?: string } = {}) {
  await tx(async (db) => {
    await db.query(
      `update token_launch_attempts set status = $2, error_code = coalesce($3, error_code), error_message = coalesce($4, error_message),
         transaction_signature = coalesce($5, transaction_signature), signed_tx_base64 = coalesce($6, signed_tx_base64), updated_at = now()
       where id = $1`,
      [a.id, next, fields.code ?? null, fields.message ?? null, fields.signature ?? null, fields.signedTx ?? null],
    );
    await db.query(
      `update tokens set launch_status = $2, launch_signature = coalesce($3, launch_signature),
         confirmed_at = case when $2 = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end
       where id = $1`,
      [a.token_id, next, fields.signature ?? null],
    );
  });
}

export async function getAttempt(userId: string, attemptId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) throw err.notFound();
  const a = await q1<AttemptRow>("select * from token_launch_attempts where id = $1 and creator_id = $2", [attemptId, userId]);
  if (!a) throw err.notFound("Launch not found.");
  return a;
}

export async function cancelLaunch(userId: string, attemptId: string) {
  const a = await getAttempt(userId, attemptId);
  const next = transition(a.status, { type: "signature_rejected" });
  if (next !== a.status) await setStatus(a, next, { code: "signature_rejected", message: "You rejected the signature request in your wallet." });
  return attemptPayload(await getAttempt(userId, attemptId));
}

export async function submitLaunch(user: { id: string; wallet: string }, attemptId: string, signedBase64: string) {
  const a = await getAttempt(user.id, attemptId);
  if (a.status !== "awaiting_signature") return attemptPayload(a); // duplicate submit: idempotent
  let signed: VersionedTransaction;
  try {
    signed = VersionedTransaction.deserialize(Buffer.from(signedBase64, "base64"));
  } catch {
    throw err.badRequest("Invalid signed transaction.");
  }
  const sponsoredTx = Boolean(a.fee_payer && a.fee_payer !== user.wallet);
  const check = verifySignedMatchesPrepared(signed, a.message_hash!, user.wallet, sponsoredTx ? { cosign: cosignAsFeePayer } : {});
  if (!check.ok) throw err.badRequest(check.reason, "tx_mismatch");

  // Persist the signature BEFORE broadcasting so a crash can never lose track of a sent transaction.
  await setStatus(a, transition(a.status, { type: "submitted", signature: check.signature }), {
    signature: check.signature,
    signedTx: Buffer.from(signed.serialize()).toString("base64"),
  });
  try {
    await rpc().sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 5 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fresh = await getAttempt(user.id, attemptId);
    if (/simulation failed|preflight|Blockhash not found/i.test(msg)) {
      // Preflight rejection: the node did not forward the transaction, so it cannot land.
      const reason = /Blockhash not found/i.test(msg)
        ? "The transaction expired before it was sent. Please launch again."
        : explainSimulation(msg, []);
      await setStatus(fresh, "failed", { code: "preflight_failed", message: reason });
    } else {
      await setStatus(fresh, transition(fresh.status, { type: "rpc_uncertain", reason: msg }), {
        code: "rpc_uncertain",
        message: "We could not confirm the broadcast. We will keep checking the network.",
      });
    }
  }
  return reconcileAttempt(await getAttempt(user.id, attemptId));
}

/** Move a non-terminal attempt forward based on on-chain truth. Safe to call repeatedly. */
export async function reconcileAttempt(a: AttemptRow) {
  if (!a.transaction_signature || !["submitted", "confirming", "unknown"].includes(a.status)) return attemptPayload(a);
  const token = await q1<{ mint_address: string; name: string; symbol: string; metadata_uri: string; clip_id: string; creator_id: string }>(
    "select mint_address, name, symbol, metadata_uri, clip_id, creator_id from tokens where id = $1",
    [a.token_id],
  );
  const creator = await q1<{ wallet_address: string }>("select wallet_address from users where id = $1", [a.creator_id]);
  if (!token || !creator) return attemptPayload(a);
  let v;
  try {
    v = await withRpc((c) =>
      verifyLaunch(c, {
        signature: a.transaction_signature!,
        mint: token.mint_address,
        creator: creator.wallet_address,
        name: token.name,
        symbol: token.symbol,
        uri: token.metadata_uri,
      }),
    );
  } catch (e) {
    const next = transition(a.status, { type: "rpc_uncertain", reason: String(e) });
    if (next !== a.status) await setStatus(a, next, { code: "rpc_uncertain", message: "Network status is temporarily unavailable." });
    return attemptPayload(await getAttempt(a.creator_id, a.id));
  }

  if (v.status === "confirmed") {
    await setStatus(a, transition(a.status, { type: "verified" }), { code: undefined });
    await q("update token_launch_attempts set error_code = null, error_message = null where id = $1", [a.id]);
    await notify(a.creator_id, "launch_confirmed", `$${token.symbol} is live on-chain`, `${token.name} launched successfully.`, `/clip/${token.clip_id}`, `launch:${a.id}`);
    await logEvent("info", "launch", "Launch confirmed", { mint: token.mint_address, signature: a.transaction_signature, slot: v.slot });
  } else if (v.status === "failed" || v.status === "mismatch") {
    const next = transition(a.status, v.status === "failed" ? { type: "onchain_error", reason: v.reason } : { type: "verification_mismatch", reason: v.reason });
    await setStatus(a, next, { code: v.status === "failed" ? "onchain_error" : "verification_mismatch", message: v.reason });
    await notify(a.creator_id, "launch_failed", `Launch of $${token.symbol} failed`, v.reason, `/create?clip=${token.clip_id}`, `launch-failed:${a.id}`);
    await logEvent("warn", "launch", v.reason, { attempt: a.id, signature: a.transaction_signature });
  } else if (v.status === "pending") {
    const next = transition(a.status, { type: "seen_processed" });
    if (next !== a.status) await setStatus(a, next);
  } else {
    // not_found: definitive failure only once the blockhash can no longer be included.
    const expired = a.last_valid_block_height
      ? await withRpc((c) => isBlockhashExpired(c, Number(a.last_valid_block_height))).catch(() => false)
      : false;
    if (expired) {
      await setStatus(a, transition(a.status, { type: "blockhash_expired_unseen" }), {
        code: "blockhash_expired",
        message: "The transaction was not included before it expired. No token was created and no SOL was spent. Please try again.",
      });
    } else if (a.signed_tx_base64 && Date.now() - Date.parse(a.updated_at) > 15_000) {
      // Re-broadcast the identical signed transaction (idempotent on Solana).
      await rpc()
        .sendRawTransaction(Buffer.from(a.signed_tx_base64, "base64"), { skipPreflight: true, maxRetries: 2 })
        .catch(() => undefined);
    }
  }
  return attemptPayload(await getAttempt(a.creator_id, a.id));
}

/**
 * Attempts that were prepared but never submitted through Fragfun block a new launch for the clip.
 * Once their blockhash has expired AND the mint does not exist on-chain they provably never landed.
 */
async function expireAbandonedAttempts(clipId: string) {
  const rows = await q<AttemptRow & { mint_address: string }>(
    `select a.*, t.mint_address from token_launch_attempts a join tokens t on t.id = a.token_id
      where t.clip_id = $1 and a.status in ('awaiting_signature', 'preparing')`,
    [clipId],
  );
  for (const a of rows) {
    if (!a.last_valid_block_height) continue;
    const expired = await withRpc((c) => isBlockhashExpired(c, Number(a.last_valid_block_height))).catch(() => false);
    if (!expired) continue;
    const mintExists = await withRpc((c) => c.getAccountInfo(new PublicKey(a.mint_address))).catch(() => "error");
    if (mintExists === null) {
      await setStatus(a, "failed", { code: "abandoned", message: "The launch was not signed before it expired." });
    } else {
      await setStatus(a, "unknown", { code: "needs_reconciliation", message: "Mint exists on-chain for an unsigned attempt; flagged for review." });
      await logEvent("warn", "launch", "Abandoned attempt has an on-chain mint", { attempt: a.id, mint: a.mint_address });
    }
  }
}

export async function reconcileOpenAttempts(limit = 25) {
  const rows = await q<AttemptRow>(
    `select * from token_launch_attempts where status in ('submitted', 'confirming', 'unknown') and transaction_signature is not null
      order by updated_at asc limit $1`,
    [limit],
  );
  const results = [];
  for (const a of rows) results.push(await reconcileAttempt(a));
  return results;
}
