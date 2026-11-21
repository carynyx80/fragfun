"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, Shield, User, Wallet, Loader2, Copy, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortAddr } from "@/lib/format";
import { publicEnv } from "@/lib/public-env";
import { Avatar } from "@/components/common/avatar";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { user, connected, connecting, signingIn, signIn, signOut, switchWallet, openWalletModal } = useAuth();
  const router = useRouter();

  if (!connected) {
    return (
      <Button onClick={openWalletModal} disabled={connecting} className="h-10 rounded-full px-4" data-testid="connect-wallet">
        {connecting ? <Loader2 className="animate-spin" /> : <Wallet />}
        {compact ? "Connect" : "Connect wallet"}
      </Button>
    );
  }
  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Button onClick={() => void signIn()} disabled={signingIn} className="h-10 rounded-full px-4" data-testid="sign-in">
          {signingIn ? <Loader2 className="animate-spin" /> : <Wallet />}
          Sign in
        </Button>
        <button
          type="button"
          onClick={() => void switchWallet()}
          disabled={signingIn}
          aria-label="Use a different wallet"
          title={`Connected: ${shortAddr(connected)} — use a different wallet`}
          className="btn-ghost flex size-10 items-center justify-center rounded-full disabled:opacity-50"
          data-testid="switch-wallet"
        >
          <ArrowLeftRight className="size-4" />
        </button>
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="btn-ghost flex h-10 items-center gap-2 rounded-full pl-1 pr-3.5 text-sm font-medium"
        data-testid="profile-menu"
      >
        <Avatar wallet={user.wallet} url={user.avatar_url} size={28} />
        <span className="hidden sm:inline">{user.username ? `@${user.username}` : shortAddr(user.wallet)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {publicEnv.network === "devnet" ? "Devnet" : "Solana mainnet"} · {shortAddr(user.wallet, 5)}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem onClick={() => router.push(`/profile/${user.wallet}`)}>
          <User /> My profile & earnings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings /> Edit profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void navigator.clipboard.writeText(user.wallet);
            toast.success("Address copied");
          }}
        >
          <Copy /> Copy address
        </DropdownMenuItem>
        {user.isAdmin && (
          <DropdownMenuItem onClick={() => router.push("/admin")}>
            <Shield /> Admin
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => void switchWallet()}>
          <ArrowLeftRight /> Switch wallet
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
