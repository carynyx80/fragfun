/**
 * Transaction inspection used before a transaction is handed to a wallet and again before it is
 * broadcast. Pure functions — unit tested.
 */
import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  VersionedTransaction,
  type MessageV0,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// Verified against @pump-fun/pump-sdk 4.3.1 (PUMP_PROGRAM_ID, PUMP_AMM_PROGRAM_ID, PUMP_FEE_PROGRAM_ID,
// MAYHEM_PROGRAM_ID). Hardcoded here so client input can never override them.
export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_AMM_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const PUMP_FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
export const MAYHEM_PROGRAM = new PublicKey("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");

/** Programs a Fragfun-prepared transaction may invoke at the top level. */
export const ALLOWED_PROGRAMS = new Set(
  [
    ComputeBudgetProgram.programId,
    SystemProgram.programId,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    PUMP_PROGRAM,
    PUMP_AMM_PROGRAM,
    PUMP_FEE_PROGRAM,
  ].map((p) => p.toBase58()),
);

export function messageHash(tx: VersionedTransaction): string {
  return createHash("sha256").update(tx.message.serialize()).digest("hex");
}

export function topLevelPrograms(message: MessageV0 | VersionedTransaction["message"]): string[] {
  const keys = message.staticAccountKeys;
  return message.compiledInstructions.map((ix) => keys[ix.programIdIndex].toBase58());
}

export interface GuardResult {
  ok: boolean;
  problems: string[];
  programs: string[];
}

/**
 * Checks a transaction prepared by the server:
 * - fee payer is the user's wallet,
 * - no address lookup tables (every account is visible),
 * - only allow-listed programs at the top level,
 * - System Program instructions limited to account creation / transfers *from the user* that the
 *   Pump programs require (ATA rent etc. happens via CPI, so top-level transfers are rejected).
 */
export function inspectPreparedTransaction(
  tx: VersionedTransaction,
  userWallet: string,
  opts: { sponsor?: string } = {},
): GuardResult {
  const problems: string[] = [];
  const msg = tx.message;
  const keys = msg.staticAccountKeys;
  const expectedFeePayer = opts.sponsor ?? userWallet;
  if (keys[0]?.toBase58() !== expectedFeePayer)
    problems.push(opts.sponsor ? "Fee payer is not the company wallet." : "Fee payer is not the connected wallet.");
  if (opts.sponsor) {
    // Sponsored: the company wallet may ONLY pay the network fee. It must not be passed to any
    // instruction (so its SOL can never fund rent, buys or transfers), and the user must still sign.
    if (msg.compiledInstructions.some((ix) => ix.accountKeyIndexes.includes(0) || ix.programIdIndex === 0))
      problems.push("Company wallet must not appear in any instruction.");
    const userIdx = keys.findIndex((k) => k.toBase58() === userWallet);
    if (userIdx < 0 || userIdx >= msg.header.numRequiredSignatures) problems.push("User wallet is not a required signer.");
  }
  if ("addressTableLookups" in msg && msg.addressTableLookups.length > 0)
    problems.push("Address lookup tables are not allowed.");
  const programs = topLevelPrograms(msg);
  for (const p of programs) if (!ALLOWED_PROGRAMS.has(p)) problems.push(`Unexpected program ${p}.`);
  msg.compiledInstructions.forEach((ix) => {
    const program = keys[ix.programIdIndex].toBase58();
    if (program === SystemProgram.programId.toBase58()) {
      // System instruction index is a u32 LE. 2 = Transfer. Fragfun never adds top-level transfers.
      const kind = ix.data.length >= 4 ? Buffer.from(ix.data).readUInt32LE(0) : -1;
      if (kind === 2) problems.push("Top-level SOL transfers are not allowed.");
    }
  });
  return { ok: problems.length === 0, problems, programs };
}

/**
 * Before broadcasting a wallet-signed transaction: it must be byte-identical (message) to what the
 * server prepared, and carry a valid signature from the expected wallet.
 */
export function verifySignedMatchesPrepared(
  signed: VersionedTransaction,
  preparedMessageHash: string,
  wallet: string,
  opts: { cosign?: (tx: VersionedTransaction) => void } = {},
): { ok: true; signature: string } | { ok: false; reason: string } {
  if (messageHash(signed) !== preparedMessageHash)
    return { ok: false, reason: "The signed transaction does not match the prepared transaction." };
  const keys = signed.message.staticAccountKeys;
  const idx = keys.findIndex((k) => k.toBase58() === wallet);
  if (idx < 0 || idx >= signed.message.header.numRequiredSignatures)
    return { ok: false, reason: "The wallet is not a required signer." };
  const sig = signed.signatures[idx];
  if (!sig || sig.every((b) => b === 0)) return { ok: false, reason: "The transaction was not signed by the wallet." };
  const ok = nacl.sign.detached.verify(signed.message.serialize(), sig, keys[idx].toBytes());
  if (!ok) return { ok: false, reason: "The wallet signature is invalid." };
  // Sponsored transactions: the company fee-payer signature is added only after the user's
  // signature on the identical message has been verified.
  if (opts.cosign) opts.cosign(signed);
  // Every required signature must be present (e.g. the mint keypair on launches).
  for (let i = 0; i < signed.message.header.numRequiredSignatures; i++) {
    const s = signed.signatures[i];
    if (!s || s.every((b) => b === 0)) return { ok: false, reason: "A required signature is missing." };
    if (!nacl.sign.detached.verify(signed.message.serialize(), s, keys[i].toBytes()))
      return { ok: false, reason: "A signature is invalid." };
  }
  return { ok: true, signature: bs58.encode(signed.signatures[0]) };
}
