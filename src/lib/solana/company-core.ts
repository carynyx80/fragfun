/**
 * Company (treasury / operations) wallet helpers. Pure functions — unit tested.
 * No key material is ever logged or returned from these functions.
 */
import bs58 from "bs58";
import { Keypair, PublicKey } from "@solana/web3.js";

/** Official Fragfun company wallet (mainnet-beta). Public address; it cannot sign by itself. */
export const DEFAULT_COMPANY_WALLET = "HLdg6LmRZi6Xfe5WgGLRPCXpr6auR1uodt4D3GotkhF8";

export const GENESIS_HASHES = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
} as const;

/**
 * A treasury must be an ordinary wallet: a valid base58 key that lies on the ed25519 curve
 * (so a private key can exist for it — unlike a program-derived address).
 */
export function parseCompanyAddress(address: string): { ok: true; key: PublicKey } | { ok: false; reason: string } {
  let key: PublicKey;
  try {
    key = new PublicKey(address);
  } catch {
    return { ok: false, reason: "not a valid Solana address" };
  }
  if (key.toBase58() !== address) return { ok: false, reason: "address is not in canonical base58 form" };
  if (!PublicKey.isOnCurve(key.toBytes())) return { ok: false, reason: "address is off-curve (a program-derived address cannot be a wallet)" };
  return { ok: true, key };
}

/**
 * Decode a server-side secret key (base58 or JSON byte array) and confirm it belongs to the
 * configured company address. Error messages never include the secret.
 */
export function loadCompanySigner(secret: string, expectedAddress: string): Keypair {
  let bytes: Uint8Array;
  const s = secret.trim();
  try {
    bytes = s.startsWith("[") ? Uint8Array.from(JSON.parse(s) as number[]) : bs58.decode(s);
  } catch {
    throw new Error("COMPANY_SIGNER_SECRET_KEY could not be decoded (expected base58 or a JSON byte array)");
  }
  if (bytes.length !== 64) throw new Error("COMPANY_SIGNER_SECRET_KEY must be a 64-byte Solana secret key");
  let kp: Keypair;
  try {
    kp = Keypair.fromSecretKey(bytes);
  } catch {
    throw new Error("COMPANY_SIGNER_SECRET_KEY is not a valid ed25519 secret key");
  } finally {
    bytes.fill(0);
  }
  if (kp.publicKey.toBase58() !== expectedAddress)
    throw new Error("COMPANY_SIGNER_SECRET_KEY does not belong to COMPANY_WALLET_ADDRESS");
  return kp;
}
