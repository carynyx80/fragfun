import { describe, expect, it } from "vitest";
import bs58 from "bs58";
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { PUMP_SDK } from "@pump-fun/pump-sdk";
import { DEFAULT_COMPANY_WALLET, GENESIS_HASHES, loadCompanySigner, parseCompanyAddress } from "@/lib/solana/company-core";
import { inspectPreparedTransaction, messageHash, verifySignedMatchesPrepared } from "@/lib/solana/tx-guard";
import { validateCompanyConfig } from "@/lib/env";

const BH = "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

describe("company wallet address", () => {
  it("accepts the official Fragfun wallet as an on-curve wallet", () => {
    const r = parseCompanyAddress(DEFAULT_COMPANY_WALLET);
    expect(r.ok).toBe(true);
  });
  it("rejects invalid, non-canonical and program-derived addresses", () => {
    expect(parseCompanyAddress("not-an-address").ok).toBe(false);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("x")], SystemProgram.programId);
    const r = parseCompanyAddress(pda.toBase58());
    expect(r).toEqual({ ok: false, reason: "address is off-curve (a program-derived address cannot be a wallet)" });
  });
  it("knows the mainnet genesis hash", () => {
    expect(GENESIS_HASHES["mainnet-beta"]).toBe("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d");
  });
});

describe("company signer loading", () => {
  const kp = Keypair.generate();
  it("loads base58 and JSON secrets that match the address", () => {
    expect(loadCompanySigner(bs58.encode(kp.secretKey), kp.publicKey.toBase58()).publicKey.equals(kp.publicKey)).toBe(true);
    expect(loadCompanySigner(JSON.stringify(Array.from(kp.secretKey)), kp.publicKey.toBase58()).publicKey.equals(kp.publicKey)).toBe(true);
  });
  it("refuses a key for a different wallet without revealing the secret", () => {
    const secret = bs58.encode(kp.secretKey);
    try {
      loadCompanySigner(secret, DEFAULT_COMPANY_WALLET);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBe("COMPANY_SIGNER_SECRET_KEY does not belong to COMPANY_WALLET_ADDRESS");
      expect((e as Error).message).not.toContain(secret);
    }
    expect(() => loadCompanySigner("abc", kp.publicKey.toBase58())).toThrow(/64-byte/);
  });
});

describe("company config validation", () => {
  const base = { COMPANY_WALLET_ADDRESS: DEFAULT_COMPANY_WALLET, COMPANY_SIGNER_SECRET_KEY: "", FEATURE_FEE_SPONSORSHIP: false };
  it("allows a public address without any signer (default)", () => expect(validateCompanyConfig(base)).toBeNull());
  it("requires a signer before sponsorship can be enabled", () =>
    expect(validateCompanyConfig({ ...base, FEATURE_FEE_SPONSORSHIP: true })).toMatch(/COMPANY_SIGNER_SECRET_KEY/));
  it("rejects malformed addresses", () => expect(validateCompanyConfig({ ...base, COMPANY_WALLET_ADDRESS: "0xabc" })).toMatch(/base58/));
});

describe("sponsored transactions", () => {
  const company = Keypair.generate();
  const user = Keypair.generate();

  async function sponsoredLaunch() {
    const mint = Keypair.generate();
    const ix = await PUMP_SDK.createV2Instruction({ mint: mint.publicKey, name: "A", symbol: "A", uri: "u", creator: user.publicKey, user: user.publicKey, mayhemMode: false });
    const msg = new TransactionMessage({ payerKey: company.publicKey, recentBlockhash: BH, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }), ix] }).compileToV0Message();
    return { tx: new VersionedTransaction(msg), mint };
  }

  it("accepts the company only as fee payer, with the user still signing", async () => {
    const { tx } = await sponsoredLaunch();
    const g = inspectPreparedTransaction(tx, user.publicKey.toBase58(), { sponsor: company.publicKey.toBase58() });
    expect(g.problems).toEqual([]);
    // Without opting in, a company fee payer is rejected.
    expect(inspectPreparedTransaction(tx, user.publicKey.toBase58()).ok).toBe(false);
  });

  it("rejects any instruction that touches the company wallet (no transfers from treasury)", () => {
    const drain = SystemProgram.transfer({ fromPubkey: company.publicKey, toPubkey: user.publicKey, lamports: 1 });
    const msg = new TransactionMessage({ payerKey: company.publicKey, recentBlockhash: BH, instructions: [drain] }).compileToV0Message();
    const g = inspectPreparedTransaction(new VersionedTransaction(msg), user.publicKey.toBase58(), { sponsor: company.publicKey.toBase58() });
    expect(g.problems).toContain("Company wallet must not appear in any instruction.");
    expect(g.problems).toContain("User wallet is not a required signer.");
  });

  it("co-signs only after verifying the user's signature, then all signatures verify", async () => {
    const { tx, mint } = await sponsoredLaunch();
    const hash = messageHash(tx);
    tx.sign([user, mint]); // what the browser does
    let cosigned = false;
    const r = verifySignedMatchesPrepared(tx, hash, user.publicKey.toBase58(), {
      cosign: (t) => {
        cosigned = true;
        t.sign([company]);
      },
    });
    expect(cosigned).toBe(true);
    expect(r.ok).toBe(true);

    // If the user never signed, the company never signs.
    const { tx: tx2 } = await sponsoredLaunch();
    let called = false;
    const r2 = verifySignedMatchesPrepared(tx2, messageHash(tx2), user.publicKey.toBase58(), { cosign: () => (called = true) });
    expect(r2.ok).toBe(false);
    expect(called).toBe(false);
  });
});
