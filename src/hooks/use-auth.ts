"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { toast } from "sonner";
import { api, friendlyWalletError } from "@/lib/client";

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

  const signIn = useCallback(async () => {
    if (!wallet.publicKey) {
      modal.setVisible(true);
      return false;
    }
    if (!wallet.signMessage) {
      toast.error("This wallet does not support message signing. Try Phantom or Solflare.");
      return false;
    }
    setSigningIn(true);
    try {
      const addr = wallet.publicKey.toBase58();
      const { message } = await api<{ message: string }>("/api/auth/nonce", { method: "POST", json: { wallet: addr } });
      const sig = await wallet.signMessage(new TextEncoder().encode(message));
      await api("/api/auth/verify", { method: "POST", json: { wallet: addr, message, signature: bs58.encode(sig) } });
      await qc.invalidateQueries();
      toast.success("Signed in");
      return true;
    } catch (e) {
      toast.error(friendlyWalletError(e));
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [wallet, modal, qc]);

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
    openWalletModal: () => modal.setVisible(true),
    wallet,
  };
}
