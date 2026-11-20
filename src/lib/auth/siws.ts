/**
 * Sign-In With Solana message construction and verification (pure functions, unit tested).
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

export interface SignInFields {
  domain: string;
  wallet: string;
  uri: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
  network: string;
}

export const STATEMENT = "Sign in to Fragfun. This request will not trigger a blockchain transaction or cost any fees.";

export function buildSignInMessage(f: SignInFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.wallet,
    "",
    STATEMENT,
    "",
    `URI: ${f.uri}`,
    `Network: ${f.network}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expirationTime}`,
  ].join("\n");
}

export function parseSignInMessage(message: string): SignInFields | null {
  const lines = message.split("\n");
  if (lines.length !== 10) return null;
  const header = /^(.+) wants you to sign in with your Solana account:$/.exec(lines[0]);
  if (!header || lines[2] !== "" || lines[3] !== STATEMENT || lines[4] !== "") return null;
  const field = (line: string, key: string) => (line.startsWith(`${key}: `) ? line.slice(key.length + 2) : null);
  const uri = field(lines[5], "URI");
  const network = field(lines[6], "Network");
  const nonce = field(lines[7], "Nonce");
  const issuedAt = field(lines[8], "Issued At");
  const expirationTime = field(lines[9], "Expiration Time");
  if (!uri || !network || !nonce || !issuedAt || !expirationTime) return null;
  return { domain: header[1], wallet: lines[1], uri, network, nonce, issuedAt, expirationTime };
}

export function isValidWalletAddress(addr: string): boolean {
  try {
    const pk = new PublicKey(addr);
    return pk.toBase58() === addr;
  } catch {
    return false;
  }
}

export function verifyWalletSignature(message: string, signatureBase58: string, wallet: string): boolean {
  try {
    const sig = bs58.decode(signatureBase58);
    if (sig.length !== 64) return false;
    const pk = new PublicKey(wallet).toBytes();
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, pk);
  } catch {
    return false;
  }
}

export type VerifyFailure =
  | "malformed_message"
  | "wallet_mismatch"
  | "domain_mismatch"
  | "network_mismatch"
  | "expired"
  | "bad_signature";

/** Checks everything that can be checked without the database (nonce lookup is done by the caller). */
export function checkSignIn(opts: {
  message: string;
  signature: string;
  wallet: string;
  expectedDomain: string;
  expectedNetwork: string;
  now?: Date;
}): { ok: true; fields: SignInFields } | { ok: false; reason: VerifyFailure } {
  const fields = parseSignInMessage(opts.message);
  if (!fields) return { ok: false, reason: "malformed_message" };
  if (fields.wallet !== opts.wallet) return { ok: false, reason: "wallet_mismatch" };
  if (fields.domain !== opts.expectedDomain) return { ok: false, reason: "domain_mismatch" };
  if (fields.network !== opts.expectedNetwork) return { ok: false, reason: "network_mismatch" };
  const now = opts.now ?? new Date();
  if (Number.isNaN(Date.parse(fields.expirationTime)) || new Date(fields.expirationTime) <= now)
    return { ok: false, reason: "expired" };
  if (!verifyWalletSignature(opts.message, opts.signature, opts.wallet)) return { ok: false, reason: "bad_signature" };
  return { ok: true, fields };
}
