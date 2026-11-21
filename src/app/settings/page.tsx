"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api, ClientApiError, friendlyWalletError } from "@/lib/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/common/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { publicEnv } from "@/lib/public-env";
import { PageHeader } from "@/components/common/empty-state";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Profile {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  twitter: string | null;
}

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const field = "h-11 rounded-xl border-white/[0.08] bg-white/[0.03] focus-visible:border-white/25";

function ProfileEditor({ wallet, profile, onSaved }: { wallet: string; profile: Profile | null; onSaved: () => void }) {
  const [f, setF] = useState({
    username: profile?.username ?? "",
    displayName: profile?.display_name ?? "",
    bio: profile?.bio ?? "",
    twitter: profile?.twitter ?? "",
    avatarUrl: profile?.avatar_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const usernameValid = !f.username || USERNAME_RE.test(f.username);
  const name = f.displayName || (f.username ? `@${f.username}` : shortAddr(wallet, 5));

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return toast.error("Images must be 4 MB or smaller.");
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("purpose", "avatar");
    try {
      const r = await api<{ url: string }>("/api/uploads/image", { method: "POST", body: fd });
      setF((s) => ({ ...s, avatarUrl: r.url }));
    } catch (err) {
      toast.error(friendlyWalletError(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <form
        className="surface space-y-6 rounded-[28px] p-6 sm:p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!usernameValid) return;
          setSaving(true);
          setUsernameError(null);
          try {
            await api("/api/profile", { method: "PATCH", json: { ...f, twitter: f.twitter || undefined } });
            onSaved();
            toast.success("Profile saved");
          } catch (err) {
            if (err instanceof ClientApiError && err.code === "username_taken") setUsernameError(err.message);
            else toast.error(friendlyWalletError(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative shrink-0 rounded-full"
            aria-label="Change profile picture"
            data-testid="avatar-upload"
          >
            <Avatar wallet={wallet} url={f.avatarUrl || null} size={88} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            </span>
          </button>
          <div className="space-y-1.5">
            <p className="font-medium">Profile picture</p>
            <p className="text-xs text-white/45">PNG, JPG or WebP, up to 4 MB. Square works best.</p>
            <div className="flex gap-3 text-sm">
              <button type="button" className="text-ff-green hover:underline" onClick={() => fileRef.current?.click()}>
                {f.avatarUrl ? "Change" : "Upload"}
              </button>
              {f.avatarUrl && (
                <button type="button" className="text-white/50 hover:text-white" onClick={() => setF({ ...f, avatarUrl: "" })}>
                  Remove
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">@</span>
              <Input
                id="username"
                value={f.username}
                maxLength={24}
                onChange={(e) => {
                  setUsernameError(null);
                  setF({ ...f, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") });
                }}
                placeholder="yourname"
                className={cn(field, "pl-8", (!usernameValid || usernameError) && "border-ff-red/60")}
                data-testid="username-input"
              />
            </div>
            <p className={cn("text-xs", !usernameValid || usernameError ? "text-ff-red" : "text-white/40")}>
              {usernameError ?? (usernameValid ? "3–24 letters, numbers or underscores." : "Use 3–24 letters, numbers or underscores.")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="display">Display name</Label>
            <Input id="display" value={f.displayName} maxLength={48} onChange={(e) => setF({ ...f, displayName: e.target.value })} placeholder="How people see you" className={field} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label htmlFor="bio">Bio</Label>
            <span className="font-mono text-[11px] text-white/35">{f.bio.length}/280</span>
          </div>
          <Textarea
            id="bio"
            value={f.bio}
            maxLength={280}
            onChange={(e) => setF({ ...f, bio: e.target.value })}
            placeholder="What do you play? What kind of clips do you make?"
            className="min-h-24 rounded-xl border-white/[0.08] bg-white/[0.03] focus-visible:border-white/25"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="x">X / Twitter</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">@</span>
            <Input id="x" value={f.twitter.replace(/^@/, "")} maxLength={15} onChange={(e) => setF({ ...f, twitter: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="handle" className={cn(field, "pl-8")} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-6">
          <Link href={`/profile/${wallet}`} className="inline-flex items-center gap-1 text-sm text-white/55 hover:text-white">
            View public profile <ArrowUpRight className="size-3.5" />
          </Link>
          <Button type="submit" disabled={saving || uploading || !usernameValid} className="h-11 rounded-full px-6" data-testid="save-profile">
            {saving ? <Loader2 className="animate-spin" /> : <Check />} Save profile
          </Button>
        </div>
      </form>

      {/* Live preview of the public profile card */}
      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow">Preview</p>
        <div className="surface overflow-hidden rounded-[28px]">
          <div className="h-20 bg-[radial-gradient(80%_120%_at_20%_0%,rgba(139,255,22,0.25),transparent_60%),linear-gradient(180deg,#141414,#0b0b0b)]" />
          <div className="-mt-10 px-5 pb-6">
            <Avatar wallet={wallet} url={f.avatarUrl || null} size={72} className="ring-4 ring-[#0b0b0b]" />
            <p className="h-section mt-3 truncate text-xl">{name}</p>
            {f.username && f.displayName && <p className="text-sm text-white/45">@{f.username}</p>}
            <p className="mt-3 whitespace-pre-line text-sm text-white/60">{f.bio || "Your bio shows up here."}</p>
            {f.twitter && <p className="mt-3 font-mono text-xs text-white/45">x.com/{f.twitter.replace(/^@/, "")}</p>}
          </div>
        </div>
      </aside>
    </div>
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
        <p className="h-section text-3xl">Sign in to edit your profile.</p>
        <Button className="mt-6 h-11 rounded-full px-6" onClick={() => (connected ? void signIn() : openWalletModal())}>
          {connected ? "Sign in" : "Connect wallet"}
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-8">
      <PageHeader eyebrow="Your profile" title="Edit profile" description="This is how you show up on your clips, tokens and the leaderboard." className="pb-6" />
      {q.isLoading || !q.data ? (
        <Skeleton className="h-96 rounded-[28px] bg-white/[0.03]" />
      ) : (
        <ProfileEditor
          wallet={user.wallet}
          profile={q.data.profile}
          onSaved={() => {
            try {
              localStorage.setItem("ff:profile-nudge", "done");
            } catch {
              /* ignore */
            }
            void qc.invalidateQueries();
          }}
        />
      )}

      <section className="surface mt-6 space-y-4 rounded-[28px] p-6 sm:p-8">
        <h2 className="h-section text-xl">Preferences</h2>
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
          <span className="text-white/50">{publicEnv.network === "devnet" ? "Solana devnet" : "Solana mainnet"}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-sm">
          <span>Signed-in wallet</span>
          <span className="truncate font-mono text-xs text-white/50">{user.wallet}</span>
        </div>
        <p className="text-xs text-white/40">Fragfun never stores seed phrases or private keys. Every transaction is approved in your own wallet.</p>
      </section>
    </div>
  );
}
