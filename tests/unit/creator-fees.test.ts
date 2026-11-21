import { describe, expect, it } from "vitest";
import { ComputeBudgetProgram, Keypair, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { PUMP_SDK } from "@pump-fun/pump-sdk";
import { inspectPreparedTransaction, PUMP_FEE_PROGRAM, PUMP_PROGRAM } from "@/lib/solana/tx-guard";
import { DEFAULT_COMPANY_WALLET } from "@/lib/solana/company-core";
import { PublicKey } from "@solana/web3.js";

const BH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

describe("creator fee split transaction", () => {
  const creator = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const company = new PublicKey(DEFAULT_COMPANY_WALLET);

  async function build(shares: { address: PublicKey; shareBps: number }[]) {
    const ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }),
      await PUMP_SDK.sweepCreatorFeeInstruction({ payer: creator, mint, creator, quoteMint: NATIVE_MINT }),
      await PUMP_SDK.createFeeSharingConfig({ creator, mint, pool: null }),
      await PUMP_SDK.updateFeeShares({ authority: creator, mint, currentShareholders: [creator], newShareholders: shares, bondingCurveComplete: false }),
    ];
    return new VersionedTransaction(new TransactionMessage({ payerKey: creator, recentBlockhash: BH, instructions: ixs }).compileToV0Message());
  }

  it("90/10 split passes the guard, fits one transaction, and needs only the creator's signature", async () => {
    const tx = await build([
      { address: creator, shareBps: 9000 },
      { address: company, shareBps: 1000 },
    ]);
    const g = inspectPreparedTransaction(tx, creator.toBase58());
    expect(g.problems).toEqual([]);
    expect(g.programs).toContain(PUMP_PROGRAM.toBase58());
    expect(g.programs).toContain(PUMP_FEE_PROGRAM.toBase58());
    expect(tx.serialize().length).toBeLessThan(1232);
    expect(tx.message.header.numRequiredSignatures).toBe(1);
    // The company wallet is only named in the split data (a passive recipient): never a signer or debited account.
    const companyIdx = tx.message.staticAccountKeys.findIndex((k) => k.equals(company));
    expect(companyIdx === -1 || companyIdx >= tx.message.header.numRequiredSignatures).toBe(true);
    const update = tx.message.compiledInstructions[tx.message.compiledInstructions.length - 1];
    expect(Buffer.from(update.data).includes(Buffer.from(company.toBytes()))).toBe(true);
    expect(Buffer.from(update.data).includes(Buffer.from(creator.toBytes()))).toBe(true);
  });

  it("rejects splits that don't total 100% or that duplicate a shareholder", async () => {
    await expect(build([{ address: creator, shareBps: 9000 }])).rejects.toThrow();
    await expect(
      build([
        { address: creator, shareBps: 5000 },
        { address: creator, shareBps: 5000 },
      ]),
    ).rejects.toThrow();
  });
});
