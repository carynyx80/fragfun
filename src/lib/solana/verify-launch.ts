/**
 * On-chain verification of a Fragfun launch. A launch is only recorded as confirmed when the
 * transaction succeeded AND it contains a Pump `create_v2` instruction whose mint, signer, creator
 * and metadata match the prepared launch. Users therefore cannot claim arbitrary mints.
 */
import { PublicKey, type Connection } from "@solana/web3.js";
import { PUMP_PROGRAM } from "./tx-guard";

export const CREATE_V2_DISCRIMINATOR = Buffer.from([214, 144, 76, 236, 95, 139, 49, 180]);
// Account order from the pump IDL (create_v2): mint = 0, user = 5.
const MINT_INDEX = 0;
const USER_INDEX = 5;

export interface CreateV2Args {
  name: string;
  symbol: string;
  uri: string;
  creator: string;
}

/** Decode the leading Borsh args of create_v2 (name, symbol, uri: string; creator: pubkey). */
export function decodeCreateV2Args(data: Uint8Array): CreateV2Args | null {
  const buf = Buffer.from(data);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(CREATE_V2_DISCRIMINATOR)) return null;
  let o = 8;
  const str = () => {
    if (o + 4 > buf.length) throw new Error("eof");
    const len = buf.readUInt32LE(o);
    o += 4;
    if (len > 1024 || o + len > buf.length) throw new Error("bad string");
    const s = buf.subarray(o, o + len).toString("utf8");
    o += len;
    return s;
  };
  try {
    const name = str();
    const symbol = str();
    const uri = str();
    if (o + 32 > buf.length) return null;
    const creator = new PublicKey(buf.subarray(o, o + 32)).toBase58();
    return { name, symbol, uri, creator };
  } catch {
    return null;
  }
}

export type LaunchVerification =
  | { status: "confirmed"; slot: number; blockTime: number | null }
  | { status: "failed"; reason: string }
  | { status: "pending"; confirmationStatus: string | null }
  | { status: "not_found" }
  | { status: "mismatch"; reason: string };

export interface ExpectedLaunch {
  signature: string;
  mint: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
}

export async function verifyLaunch(conn: Connection, e: ExpectedLaunch): Promise<LaunchVerification> {
  const { value } = await conn.getSignatureStatuses([e.signature], { searchTransactionHistory: true });
  const st = value[0];
  if (!st) return { status: "not_found" };
  if (st.err) return { status: "failed", reason: `Transaction failed on-chain: ${JSON.stringify(st.err)}` };
  if (st.confirmationStatus !== "confirmed" && st.confirmationStatus !== "finalized")
    return { status: "pending", confirmationStatus: st.confirmationStatus ?? null };

  const tx = await conn.getTransaction(e.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx) return { status: "pending", confirmationStatus: st.confirmationStatus ?? null };
  if (tx.meta?.err) return { status: "failed", reason: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}` };

  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
  const ixs = tx.transaction.message.compiledInstructions;
  const create = ixs.find(
    (ix) =>
      keys.get(ix.programIdIndex)?.equals(PUMP_PROGRAM) &&
      Buffer.from(ix.data).subarray(0, 8).equals(CREATE_V2_DISCRIMINATOR),
  );
  if (!create) return { status: "mismatch", reason: "No Pump create_v2 instruction in transaction." };
  const mint = keys.get(create.accountKeyIndexes[MINT_INDEX])?.toBase58();
  const user = keys.get(create.accountKeyIndexes[USER_INDEX])?.toBase58();
  if (mint !== e.mint) return { status: "mismatch", reason: "Mint address does not match the prepared launch." };
  if (user !== e.creator) return { status: "mismatch", reason: "Launch signer is not the creator wallet." };
  const args = decodeCreateV2Args(create.data);
  if (!args) return { status: "mismatch", reason: "Could not decode create_v2 arguments." };
  if (args.creator !== e.creator) return { status: "mismatch", reason: "On-chain creator does not match." };
  if (args.name !== e.name || args.symbol !== e.symbol || args.uri !== e.uri)
    return { status: "mismatch", reason: "On-chain metadata does not match the prepared launch." };
  return { status: "confirmed", slot: tx.slot, blockTime: tx.blockTime ?? null };
}

/** True once the blockhash used by a never-seen transaction can no longer be included. */
export async function isBlockhashExpired(conn: Connection, lastValidBlockHeight: number): Promise<boolean> {
  const height = await conn.getBlockHeight("finalized");
  return height > lastValidBlockHeight;
}
