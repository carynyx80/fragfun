"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { toast } from "sonner";
import { api, friendlyWalletError, isUserRejection } from "@/lib/client";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
/** Errors meaning "this wallet/account cannot sign plain messages" — the only case where we fall back. */
const MESSAGE_UNSUPPORTED = /not supported|unsupported|not implemented|method not found|does not support|ledger/i;

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * Memo-only transaction carrying the sign-in message. It uses a real recent blockhash so the wallet can
 * simulate it (Phantom warns about transactions it cannot simulate); Fragfun only verifies the signature
 * and never broadcasts it.
 */
function signInTransaction(pk: PublicKey, message: string, recentBlockhash: string) {
  return new Transaction({ feePayer: pk, recentBlockhash }).add(
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: pk, isSigner: true, isWritable: false }],
      // web3.js only bs58-encodes this field, so a Uint8Array works in the browser without a Buffer polyfill.
      data: new TextEncoder().encode(message) as unknown as Buffer,
    }),
  );
}

// ---- Connect flow state shared by every useAuth() caller ----
/** Set when the user starts connecting, so we ask for the sign-in signature right after the wallet connects. */
let autoSignInRequested = false;
export const autoSignInPending = () => autoSignInRequested;
export const clearAutoSignIn = () => {
  autoSignInRequested = false;
};

/** "Open in wallet app" sheet for phone browsers that have no wallet available (e.g. Safari on iPhone). */
let mobileDialogOpen = false;
const mobileListeners = new Set<() => void>();
export function setMobileWalletDialog(open: boolean) {
  mobileDialogOpen = open;
  mobileListeners.forEach((l) => l());
}
export function useMobileWalletDialog() {
  return useSyncExternalStore(
    (l) => {
      mobileListeners.add(l);
      return () => mobileListeners.delete(l);
    },
    () => mobileDialogOpen,
    () => false,
  );
}
const isMobileBrowser = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export interface SessionInfo {
  id: string;
  wallet: string;
  isAdmin: boolean;
  status: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Wallet connection + Sign-In With Solana.
 * The server session is bound to the wallet that signed; if the connected wallet changes,
 * the old session is dropped until the new wallet signs.
 */
export function useAuth() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const modal = useWalletModal();
  const qc = useQueryClient();
  const [signingIn, setSigningIn] = useState(false);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ user: SessionInfo | null }>("/api/auth/session"),
    staleTime: 60_000,
  });
  const user = session.data?.user ?? null;
  const connected = wallet.publicKey?.toBase58() ?? null;
  const mismatch = Boolean(user && connected && user.wallet !== connected);

  const openWalletModal = useCallback(() => {
    autoSignInRequested = true;
    // Android exposes installed wallet apps through the Mobile Wallet Adapter; desktop and in-wallet browsers
    // expose injected / Wallet Standard wallets. A phone browser with neither gets "open in wallet app" links.
    const available = wallet.wallets.some(
      (w) => w.readyState === WalletReadyState.Installed || w.adapter.name === "Mobile Wallet Adapter",
    );
    if (isMobileBrowser() && !available) setMobileWalletDialog(true);
    else modal.setVisible(true);
  }, [wallet.wallets, modal]);

  const signIn = useCallback(async () => {
    clearAutoSignIn();
    if (!wallet.publicKey) {
      openWalletModal();
      return false;
    }
    const canMessage = Boolean(wallet.signMessage);
    const canTx = Boolean(wallet.signTransaction);
    if (!canMessage && !canTx) {
      toast.error("This wallet can't sign in. Try Phantom, Solflare or Backpack.");
      return false;
    }
    setSigningIn(true);
    try {
      const pk = wallet.publicKey;
      const addr = pk.toBase58();
      const { message } = await api<{ message: string }>("/api/auth/nonce", { method: "POST", json: { wallet: addr } });

      // Fallback for wallets that cannot sign plain messages (e.g. Ledger-backed accounts): sign a Memo-only
      // transaction with a placeholder blockhash. It is never sent, cannot move funds and costs nothing.
      const signWithTransaction = async (msg: string) => {
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        const signed = await wallet.signTransaction!(signInTransaction(pk, msg, blockhash));
        return { transaction: toBase64(signed.serialize({ requireAllSignatures: true, verifySignatures: false })) };
      };

      let proof: { signature: string } | { transaction: string };
      if (canMessage) {
        try {
          const sig = await wallet.signMessage!(new TextEncoder().encode(message));
          proof = { signature: bs58.encode(sig) };
        } catch (e) {
          console.warn("[sign-in] signMessage failed:", e);
          const text = e instanceof Error ? `${e.name} ${e.message} ${String((e as { error?: unknown }).error ?? "")}` : String(e);
          // Only fall back when the wallet genuinely can't sign messages; any other failure (rejected, blocked,
          // locked) is shown as-is instead of following up with a second, unexpected request.
          if (isUserRejection(e) || !canTx || !MESSAGE_UNSUPPORTED.test(text)) throw e;
          toast.message("Your wallet can't sign messages — approve the sign-in transaction instead. Fragfun never sends it, so it costs nothing.");
          proof = await signWithTransaction(message);
        }
      } else {
        toast.message("Approve the sign-in transaction in your wallet. Fragfun never sends it, so it costs nothing.");
        proof = await signWithTransaction(message);
      }
      try {
        await api("/api/auth/verify", { method: "POST", json: { wallet: addr, message, ...proof } });
      } catch (e) {
        // Some wallets alter or wrap signed messages; retry once with the transaction method.
        if (!("signature" in proof) || !canTx || !(e instanceof Error) || !/verified/i.test(e.message)) throw e;
        const { message: retryMessage } = await api<{ message: string }>("/api/auth/nonce", { method: "POST", json: { wallet: addr } });
        toast.message("One more approval needed — Fragfun never sends this sign-in transaction, so it costs nothing.");
        const retry = await signWithTransaction(retryMessage);
        await api("/api/auth/verify", { method: "POST", json: { wallet: addr, message: retryMessage, ...retry } });
      }
      await qc.invalidateQueries();
      toast.success("Signed in");
      return true;
    } catch (e) {
      toast.error(friendlyWalletError(e));
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [wallet, connection, openWalletModal, qc]);

  /** Disconnect the current wallet and let the user pick another one. */
  const switchWallet = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST", json: {} }).catch(() => undefined);
    await wallet.disconnect().catch(() => undefined);
    wallet.select(null);
    await qc.invalidateQueries({ queryKey: ["session"] });
    openWalletModal();
  }, [wallet, qc, openWalletModal]);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST", json: {} }).catch(() => undefined);
    await wallet.disconnect().catch(() => undefined);
    await qc.invalidateQueries();
  }, [wallet, qc]);

  const lastWallet = useRef<string | null>(null);
  useEffect(() => {
    if (mismatch && lastWallet.current !== connected) {
      lastWallet.current = connected;
      void api("/api/auth/logout", { method: "POST", json: {} }).then(() => qc.invalidateQueries({ queryKey: ["session"] }));
    }
  }, [mismatch, connected, qc]);

  return {
    user: mismatch ? null : user,
    loading: session.isLoading,
    connected,
    connecting: wallet.connecting,
    signingIn,
    signIn,
    signOut,
    switchWallet,
    openWalletModal,
    wallet,
  };
}
