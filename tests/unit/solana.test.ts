import { describe, expect, it } from "vitest";
import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { PUMP_SDK } from "@pump-fun/pump-sdk";
import { inspectPreparedTransaction, messageHash, verifySignedMatchesPrepared, PUMP_PROGRAM } from "@/lib/solana/tx-guard";
import { decodeCreateV2Args, CREATE_V2_DISCRIMINATOR } from "@/lib/solana/verify-launch";
import { curveProgress, priceSolPerToken, estimateFees } from "@/lib/solana/pump-core";

const BLOCKHASH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

function tx(payer: PublicKey, ixs: TransactionInstruction[]) {
  return new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: BLOCKHASH, instructions: ixs }).compileToV0Message());
}

describe("transaction guard", () => {
  const user = Keypair.generate();

  it("accepts an offline-built Pump create_v2 transaction (no RPC, official SDK)", async () => {
    const mint = Keypair.generate();
    const ix = await PUMP_SDK.createV2Instruction({
      mint: mint.publicKey,
      name: "Crazy Highway Jump",
      symbol: "JUMP6",
      uri: "https://example.com/m.json",
      creator: user.publicKey,
      user: user.publicKey,
      mayhemMode: false,
    });
    expect(ix.programId.equals(PUMP_PROGRAM)).toBe(true);
    const t = tx(user.publicKey, [ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }), ix]);
    const g = inspectPreparedTransaction(t, user.publicKey.toBase58());
    expect(g.problems).toEqual([]);
    expect(g.ok).toBe(true);
    // Decoder recovers the exact arguments, with mint at account index 0 and user at index 5.
    const args = decodeCreateV2Args(ix.data);
    expect(args).toEqual({ name: "Crazy Highway Jump", symbol: "JUMP6", uri: "https://example.com/m.json", creator: user.publicKey.toBase58() });
    expect(ix.keys[0].pubkey.equals(mint.publicKey)).toBe(true);
    expect(ix.keys[5].pubkey.equals(user.publicKey)).toBe(true);
  });

  it("rejects hidden SOL transfers, foreign programs and a different fee payer", () => {
    const attacker = Keypair.generate().publicKey;
    const t1 = tx(user.publicKey, [SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: attacker, lamports: 1 })]);
    expect(inspectPreparedTransaction(t1, user.publicKey.toBase58()).problems).toContain("Top-level SOL transfers are not allowed.");
    const t2 = tx(user.publicKey, [{ programId: Keypair.generate().publicKey, keys: [], data: Buffer.alloc(0) }]);
    expect(inspectPreparedTransaction(t2, user.publicKey.toBase58()).ok).toBe(false);
    const t3 = tx(attacker, [ComputeBudgetProgram.setComputeUnitLimit({ units: 1 })]);
    expect(inspectPreparedTransaction(t3, user.publicKey.toBase58()).problems).toContain("Fee payer is not the connected wallet.");
  });

  it("only broadcasts a signed transaction identical to the prepared one", () => {
    const t = tx(user.publicKey, [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })]);
    const hash = messageHash(t);
    t.sign([user]);
    const ok = verifySignedMatchesPrepared(t, hash, user.publicKey.toBase58());
    expect(ok.ok).toBe(true);

    const altered = tx(user.publicKey, [ComputeBudgetProgram.setComputeUnitLimit({ units: 999_999 })]);
    altered.sign([user]);
    expect(verifySignedMatchesPrepared(altered, hash, user.publicKey.toBase58())).toEqual({
      ok: false,
      reason: "The signed transaction does not match the prepared transaction.",
    });

    const unsigned = tx(user.publicKey, [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })]);
    expect(verifySignedMatchesPrepared(unsigned, hash, user.publicKey.toBase58()).ok).toBe(false);
  });

  it("requires every signer (mint keypair) to have signed", async () => {
    const mint = Keypair.generate();
    const ix = await PUMP_SDK.createV2Instruction({
      mint: mint.publicKey,
      name: "A",
      symbol: "A",
      uri: "u",
      creator: user.publicKey,
      user: user.publicKey,
      mayhemMode: false,
    });
    const t = tx(user.publicKey, [ix]);
    const hash = messageHash(t);
    t.sign([user]);
    expect(verifySignedMatchesPrepared(t, hash, user.publicKey.toBase58()).ok).toBe(false);
    t.sign([mint]);
    expect(verifySignedMatchesPrepared(t, hash, user.publicKey.toBase58()).ok).toBe(true);
  });
});

describe("launch verification decoding", () => {
  it("rejects data with the wrong discriminator", () => {
    expect(decodeCreateV2Args(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0]))).toBeNull();
    expect(decodeCreateV2Args(Buffer.concat([CREATE_V2_DISCRIMINATOR, Buffer.from([255, 255, 255, 255])]))).toBeNull();
  });
});

describe("market math", () => {
  it("computes price and curve progress from reserves", () => {
    // 30 SOL virtual vs 1,073,000,000 tokens (6 decimals): initial Pump curve parameters.
    const price = priceSolPerToken({ virtualQuoteReserves: new BN(30_000_000_000), virtualTokenReserves: new BN("1073000000000000") });
    expect(price).toBeCloseTo(2.796e-8, 10);
    const initial = new BN("793100000000000");
    expect(curveProgress({ realTokenReserves: initial, complete: false }, initial)).toBe(0);
    expect(curveProgress({ realTokenReserves: initial.divn(2), complete: false }, initial)).toBeCloseTo(0.5, 3);
    expect(curveProgress({ realTokenReserves: new BN(0), complete: true }, initial)).toBe(1);
  });
  it("estimates fees", () => {
    expect(estimateFees(2, 250_000, 50_000)).toEqual({ networkFeeLamports: 10_000, priorityFeeLamports: 12_500, computeUnitLimit: 250_000 });
  });
});
