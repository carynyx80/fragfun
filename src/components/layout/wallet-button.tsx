"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, Shield, User, Wallet, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortAddr } from "@/lib/format";
import { publicEnv } from "@/lib/public-env";
import { Avatar } from "@/components/common/avatar";

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { user, connected, connecting, signingIn, signIn, signOut, openWalletModal } = useAuth();
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
      <Button onClick={() => void signIn()} disabled={signingIn} className="h-10 rounded-full px-4" data-testid="sign-in">
        {signingIn ? <Loader2 className="animate-spin" /> : <Wallet />}
        Sign in
      </Button>
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
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {publicEnv.network === "devnet" ? "Devnet" : "Solana mainnet"} · {shortAddr(user.wallet, 5)}
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={() => router.push(`/profile/${user.wallet}`)}>
          <User /> Profile & dashboard
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Settings /> Settings
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut /> Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
