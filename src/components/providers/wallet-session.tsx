"use client";

import { useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { useAuth, autoSignInPending, clearAutoSignIn, setMobileWalletDialog, useMobileWalletDialog } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Mounted once. (1) Right after a user-initiated wallet connection, asks for the sign-in signature so
 * people don't have to find a second button. (2) Shows "open in wallet app" links on phone browsers
 * that have no wallet (wallet apps open fragfun.xyz in their built-in browser, where signing works).
 */
export function WalletSession() {
  const { user, loading, connected, signIn, signingIn } = useAuth();
  const open = useMobileWalletDialog();

  useEffect(() => {
    if (!connected || loading) return;
    if (user) {
      clearAutoSignIn();
      return;
    }
    if (autoSignInPending() && !signingIn) void signIn();
  }, [connected, user, loading, signIn, signingIn]);

  const here = typeof window !== "undefined" ? window.location.href : "https://www.fragfun.xyz";
  const ref = typeof window !== "undefined" ? window.location.origin : "https://www.fragfun.xyz";
  const links = [
    { name: "Phantom", href: `https://phantom.app/ul/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(ref)}` },
    { name: "Solflare", href: `https://solflare.com/ul/v1/browse/${encodeURIComponent(here)}?ref=${encodeURIComponent(ref)}` },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => setMobileWalletDialog(o)}>
      <DialogContent className="rounded-[28px] border-white/[0.08] bg-[#0b0b0b] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Open Fragfun in your wallet</DialogTitle>
          <DialogDescription>
            Phone browsers can&apos;t reach wallet apps directly. Open Fragfun inside your wallet app&apos;s browser to connect and sign in.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {links.map((l) => (
            <a
              key={l.name}
              href={l.href}
              className="btn-ghost flex h-12 items-center justify-between rounded-2xl px-4 text-sm font-semibold"
              data-testid={`open-in-${l.name.toLowerCase()}`}
            >
              Open in {l.name}
              <ExternalLink className="size-4 opacity-60" />
            </a>
          ))}
        </div>
        <p className="text-xs text-ff-muted">Using another wallet app? Open its built-in browser and go to fragfun.xyz.</p>
      </DialogContent>
    </Dialog>
  );
}
