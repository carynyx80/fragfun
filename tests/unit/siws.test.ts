import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createSignInMessageText, parseSignInMessageText } from "@solana/wallet-standard-util";
import { MEMO_PROGRAM_ID, buildSignInMessage, checkSignIn, isValidWalletAddress, parseSignInMessage } from "@/lib/auth/siws";

function signed(overrides: Partial<Parameters<typeof buildSignInMessage>[0]> = {}, signer = Keypair.generate()) {
  const now = new Date();
  const message = buildSignInMessage({
    domain: "localhost:3000",
    wallet: signer.publicKey.toBase58(),
    uri: "http://localhost:3000",
    nonce: "abc123",
    issuedAt: now.toISOString(),
    expirationTime: new Date(now.getTime() + 5 * 60_000).toISOString(),
    network: "devnet",
    ...overrides,
  });
  const sig = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), signer.secretKey));
  return { message, sig, wallet: signer.publicKey.toBase58(), signer };
}

describe("Sign-In With Solana", () => {
  it("round-trips the message format", () => {
    const { message, wallet } = signed();
    const f = parseSignInMessage(message);
    expect(f?.wallet).toBe(wallet);
    expect(f?.nonce).toBe("abc123");
    expect(f?.domain).toBe("localhost:3000");
  });

  it("accepts a valid signature", () => {
    const { message, sig, wallet } = signed();
    const r = checkSignIn({ message, signature: sig, wallet, expectedDomain: "localhost:3000", expectedNetwork: "devnet" });
    expect(r.ok).toBe(true);
  });

  it("rejects a signature from a different wallet", () => {
    const { message, sig } = signed();
    const other = Keypair.generate().publicKey.toBase58();
    const r = checkSignIn({ message, signature: sig, wallet: other, expectedDomain: "localhost:3000", expectedNetwork: "devnet" });
    expect(r).toEqual({ ok: false, reason: "wallet_mismatch" });
  });

  it("rejects a forged signature for the right wallet", () => {
    const signer = Keypair.generate();
    const { message } = signed({}, signer);
    const forged = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), Keypair.generate().secretKey));
    const r = checkSignIn({ message, signature: forged, wallet: signer.publicKey.toBase58(), expectedDomain: "localhost:3000", expectedNetwork: "devnet" });
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects messages for another domain (phishing replay)", () => {
    const { message, sig, wallet } = signed({ domain: "evil.example" });
    const r = checkSignIn({ message, signature: sig, wallet, expectedDomain: "localhost:3000", expectedNetwork: "devnet" });
    expect(r).toEqual({ ok: false, reason: "domain_mismatch" });
  });

  it("rejects expired messages", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const { message, sig, wallet } = signed({ expirationTime: past });
    const r = checkSignIn({ message, signature: sig, wallet, expectedDomain: "localhost:3000", expectedNetwork: "devnet" });
    expect(r).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects network mismatch and tampered messages", () => {
    const { message, sig, wallet } = signed();
    expect(checkSignIn({ message, signature: sig, wallet, expectedDomain: "localhost:3000", expectedNetwork: "mainnet-beta" })).toEqual({
      ok: false,
      reason: "network_mismatch",
    });
    const tampered = message.replace("Nonce: abc123", "Nonce: zzz999");
    expect(checkSignIn({ message: tampered, signature: sig, wallet, expectedDomain: "localhost:3000", expectedNetwork: "devnet" })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
    expect(checkSignIn({ message: "hello", signature: sig, wallet, expectedDomain: "localhost:3000", expectedNetwork: "devnet" })).toEqual({
      ok: false,
      reason: "malformed_message",
    });
  });

  it("validates wallet addresses", () => {
    expect(isValidWalletAddress(Keypair.generate().publicKey.toBase58())).toBe(true);
    expect(isValidWalletAddress("not-a-wallet")).toBe(false);
    expect(isValidWalletAddress("")).toBe(false);
  });
});

describe("Sign-in by Memo transaction (wallets without signMessage)", () => {
  const base = { expectedDomain: "localhost:3000", expectedNetwork: "devnet" };
  function memoTx(message: string, signer: Keypair, opts: { blockhash?: string; extra?: boolean; feePayer?: Keypair; program?: PublicKey } = {}) {
    const payer = opts.feePayer ?? signer;
    const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: opts.blockhash ?? Keypair.generate().publicKey.toBase58() }).add(
      new TransactionInstruction({
        programId: opts.program ?? new PublicKey(MEMO_PROGRAM_ID),
        keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
        data: Buffer.from(message, "utf8"),
      }),
    );
    if (opts.extra) tx.add(SystemProgram.transfer({ fromPubkey: signer.publicKey, toPubkey: Keypair.generate().publicKey, lamports: 1 }));
    tx.sign(...(payer === signer ? [signer] : [payer, signer]));
    return tx.serialize().toString("base64");
  }

  it("accepts a valid signed memo transaction", () => {
    const { message, wallet, signer } = signed();
    expect(checkSignIn({ ...base, message, wallet, transaction: memoTx(message, signer) }).ok).toBe(true);
  });
  it("rejects a memo with different text", () => {
    const { message, wallet, signer } = signed();
    expect(checkSignIn({ ...base, message, wallet, transaction: memoTx(message + "x", signer) }).ok).toBe(false);
  });
  it("rejects extra instructions such as a transfer", () => {
    const { message, wallet, signer } = signed();
    expect(checkSignIn({ ...base, message, wallet, transaction: memoTx(message, signer, { extra: true }) }).ok).toBe(false);
  });
  it("rejects another fee payer or another program", () => {
    const { message, wallet, signer } = signed();
    expect(checkSignIn({ ...base, message, wallet, transaction: memoTx(message, signer, { feePayer: Keypair.generate() }) }).ok).toBe(false);
    expect(checkSignIn({ ...base, message, wallet, transaction: memoTx(message, signer, { program: Keypair.generate().publicKey }) }).ok).toBe(false);
  });
  it("rejects a transaction signed by a different wallet", () => {
    const { message, wallet } = signed();
    const other = Keypair.generate();
    expect(checkSignIn({ ...base, message, wallet, transaction: memoTx(message, other) }).ok).toBe(false);
  });
});

describe("SIWS standard compliance", () => {
  it("produces a message the official Wallet Standard parser accepts and re-creates byte-for-byte", () => {
    const { message, wallet } = signed({ network: "mainnet-beta", domain: "www.fragfun.xyz", uri: "https://www.fragfun.xyz" });
    const parsed = parseSignInMessageText(message);
    expect(parsed).not.toBeNull();
    expect(parsed?.address).toBe(wallet);
    expect(parsed?.domain).toBe("www.fragfun.xyz");
    expect(parsed?.chainId).toBe("mainnet");
    expect(parsed?.version).toBe("1");
    expect(createSignInMessageText(parsed!)).toBe(message);
  });
});
