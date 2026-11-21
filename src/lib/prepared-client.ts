"use client";

import { VersionedTransaction } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { api, b64ToBytes, bytesToB64 } from "@/lib/client";

export interface PreparedStatus {
  txId: string;
  kind: string;
  status: string;
  signature: string | null;
  error: string | null;
}

/** Wallet-sign a server-prepared transaction, submit it, and wait for a final on-chain status. */
export async function signSubmitAndTrack(wallet: WalletContextState, txId: string, transactionB64: string, onUpdate?: (s: PreparedStatus) => void) {
  if (!wallet.signTransaction) throw new Error("This wallet cannot sign transactions.");
  const signed = await wallet.signTransaction(VersionedTransaction.deserialize(b64ToBytes(transactionB64)));
  let s = await api<PreparedStatus>(`/api/prepared/${txId}/submit`, { method: "POST", json: { signedTransaction: bytesToB64(signed.serialize()) } });
  onUpdate?.(s);
  for (let i = 0; i < 60 && ["submitted", "unknown", "signed"].includes(s.status); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    s = await api<PreparedStatus>(`/api/prepared/${txId}`);
    onUpdate?.(s);
  }
  return s;
}
