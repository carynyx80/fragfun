"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api, friendlyWalletError } from "@/lib/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/common/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { publicEnv } from "@/lib/public-env";

interface Profile {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  twitter: string | null;
}

function ProfileForm({ wallet, profile, onSaved }: { wallet: string; profile: Profile | null; onSaved: () => void }) {
  const [f, setF] = useState({
    username: profile?.username ?? "",
    displayName: profile?.display_name ?? "",
    bio: profile?.bio ?? "",
    twitter: profile?.twitter ?? "",
    avatarUrl: profile?.avatar_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="mt-6 space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await api("/api/profile", { method: "PATCH", json: { ...f, twitter: f.twitter || undefined } });
          onSaved();
          toast.success("Profile saved");
        } catch (err) {
          toast.error(friendlyWalletError(err));
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="flex items-center gap-4">
        <Avatar wallet={wallet} url={f.avatarUrl || null} size={64} />
        <label className="cursor-pointer text-sm underline underline-offset-4">
          Change avatar
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.append("file", file);
              fd.append("purpose", "avatar");
              try {
                const r = await api<{ url: string }>("/api/uploads/image", { method: "POST", body: fd });
                setF((s) => ({ ...s, avatarUrl: r.url }));
              } catch (err) {
                toast.error(friendlyWalletError(err));
              }
            }}
          />
        </label>
      </div>
      <div className="space-y-1.5">
        <Label>Username</Label>
        <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder="letters, numbers, _" className="h-10 border-ff-border bg-ff-bg2" />
      </div>
      <div className="space-y-1.5">
        <Label>Display name</Label>
        <Input value={f.displayName} maxLength={48} onChange={(e) => setF({ ...f, displayName: e.target.value })} className="h-10 border-ff-border bg-ff-bg2" />
      </div>
      <div className="space-y-1.5">
        <Label>Bio</Label>
        <Textarea value={f.bio} maxLength={280} onChange={(e) => setF({ ...f, bio: e.target.value })} className="border-ff-border bg-ff-bg2" />
      </div>
      <div className="space-y-1.5">
        <Label>X / Twitter handle</Label>
        <Input value={f.twitter} maxLength={16} onChange={(e) => setF({ ...f, twitter: e.target.value })} placeholder="@handle" className="h-10 border-ff-border bg-ff-bg2" />
      </div>
      <Button type="submit" disabled={saving} className="h-10 rounded-full px-5 font-semibold">
        {saving && <Loader2 className="animate-spin" />} Save profile
      </Button>
    </form>
  );
}

export default function SettingsPage() {
  const { user, connected, signIn, openWalletModal } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<{ profile: Profile | null }>("/api/profile"), enabled: Boolean(user) });
  const [autoplay, setAutoplay] = useState(() => {
    try {
      return typeof window === "undefined" || localStorage.getItem("ff:autoplay") !== "0";
    } catch {
      return true;
    }
  });

  if (!user)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="font-medium">Sign in to edit your settings</p>
        <Button className="mt-4 h-10 rounded-full px-5" onClick={() => (connected ? void signIn() : openWalletModal())}>
          {connected ? "Sign in" : "Connect wallet"}
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      {q.isLoading || !q.data ? <Skeleton className="mt-6 h-80 rounded-2xl bg-ff-card" /> : <ProfileForm wallet={user.wallet} profile={q.data.profile} onSaved={() => void qc.invalidateQueries()} />}

      <section className="mt-10 space-y-4 border-t border-ff-border pt-6">
        <h2 className="font-semibold">Preferences</h2>
        <label className="flex items-center justify-between text-sm">
          Autoplay videos in feeds
          <input
            type="checkbox"
            checked={autoplay}
            className="size-4 accent-[#8bff16]"
            onChange={(e) => {
              setAutoplay(e.target.checked);
              try {
                localStorage.setItem("ff:autoplay", e.target.checked ? "1" : "0");
              } catch {
                /* ignore */
              }
            }}
          />
        </label>
        <div className="flex items-center justify-between text-sm">
          <span>Network</span>
          <span className="text-ff-muted">{publicEnv.network === "devnet" ? "Solana devnet" : "Solana mainnet"}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Signed-in wallet</span>
          <span className="font-mono text-xs text-ff-muted">{user.wallet}</span>
        </div>
        <p className="text-xs text-ff-muted">Fragfun never stores seed phrases or private keys. Every transaction is approved in your own wallet.</p>
      </section>
    </div>
  );
}
