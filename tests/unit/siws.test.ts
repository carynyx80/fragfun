import { describe, expect, it } from "vitest";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";
import { buildSignInMessage, checkSignIn, isValidWalletAddress, parseSignInMessage } from "@/lib/auth/siws";

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
