/**
 * Sign-In With Solana message construction and verification (pure functions, unit tested).
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey, Transaction } from "@solana/web3.js";

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

/** SIWS "Chain ID" values (mainnet, devnet, testnet, localnet) ↔ our SOLANA_NETWORK names. */
const toChainId = (network: string) => (network === "mainnet-beta" ? "mainnet" : network);
const fromChainId = (chainId: string) => (chainId === "mainnet" ? "mainnet-beta" : chainId);

/**
 * Standard Sign-In With Solana (SIWS / CAIP-122) message. Wallets such as Phantom parse messages that
 * start with "… wants you to sign in with your Solana account:" and validate them, so the field names and
 * order must follow the spec exactly (URI, Version, Chain ID, Nonce, Issued At, Expiration Time).
 */
export function buildSignInMessage(f: SignInFields): string {
  return [
    `${f.domain} wants you to sign in with your Solana account:`,
    f.wallet,
    "",
    STATEMENT,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    `Chain ID: ${toChainId(f.network)}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
    `Expiration Time: ${f.expirationTime}`,
  ].join("\n");
}

export function parseSignInMessage(message: string): SignInFields | null {
  const lines = message.split("\n");
  if (lines.length !== 11) return null;
  const header = /^(.+) wants you to sign in with your Solana account:$/.exec(lines[0]);
  if (!header || lines[2] !== "" || lines[3] !== STATEMENT || lines[4] !== "") return null;
  const field = (line: string, key: string) => (line.startsWith(`${key}: `) ? line.slice(key.length + 2) : null);
  const uri = field(lines[5], "URI");
  const version = field(lines[6], "Version");
  const chainId = field(lines[7], "Chain ID");
  const nonce = field(lines[8], "Nonce");
  const issuedAt = field(lines[9], "Issued At");
  const expirationTime = field(lines[10], "Expiration Time");
  if (!uri || version !== "1" || !chainId || !nonce || !issuedAt || !expirationTime) return null;
  return { domain: header[1], wallet: lines[1], uri, network: fromChainId(chainId), nonce, issuedAt, expirationTime };
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

/** SPL Memo program (v2). */
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
/**
 * Fallback for wallets that cannot sign messages (e.g. Ledger-backed accounts): the wallet signs a
 * transaction whose only instruction is a Memo containing the exact sign-in message. Accepted only if it
 * has exactly that one instruction, the wallet as fee payer and a valid signature from the wallet.
 * It uses a real recent blockhash so wallets can simulate it (Phantom flags transactions it cannot
 * simulate). Fragfun never broadcasts it; replay is prevented by the single-use nonce in the message.
 */
export function verifySignInTransaction(message: string, transactionBase64: string, wallet: string): boolean {
  try {
    const raw = Buffer.from(transactionBase64, "base64");
    if (raw.length === 0 || raw.length > 1232) return false;
    const tx = Transaction.from(raw);
    if (!tx.feePayer || tx.feePayer.toBase58() !== wallet) return false;
    if (!tx.recentBlockhash) return false;
    if (tx.instructions.length !== 1) return false;
    const ix = tx.instructions[0];
    if (ix.programId.toBase58() !== MEMO_PROGRAM_ID) return false;
    if (ix.keys.some((k) => k.pubkey.toBase58() !== wallet)) return false;
    if (Buffer.from(ix.data).toString("utf8") !== message) return false;
    const entry = tx.signatures.find((s) => s.publicKey.toBase58() === wallet);
    if (!entry?.signature || entry.signature.length !== 64) return false;
    return nacl.sign.detached.verify(tx.serializeMessage(), entry.signature, new PublicKey(wallet).toBytes());
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
  /** Base58 ed25519 signature of the message (wallets with signMessage). */
  signature?: string;
  /** Base64 signed Memo transaction (fallback for wallets without signMessage). */
  transaction?: string;
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
  const valid = opts.signature
    ? verifyWalletSignature(opts.message, opts.signature, opts.wallet)
    : opts.transaction
      ? verifySignInTransaction(opts.message, opts.transaction, opts.wallet)
      : false;
  if (!valid) return { ok: false, reason: "bad_signature" };
  return { ok: true, fields };
}
