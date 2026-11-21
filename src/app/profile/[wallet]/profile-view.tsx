"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ClientApiError, friendlyWalletError } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { Avatar } from "@/components/common/avatar";
import { ClipGrid } from "@/components/clip/clip-card";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { ReportButton } from "@/components/clip/engagement";
import { CreatorFeesPanel } from "@/components/market/creator-fees";
import { Skeleton } from "@/components/ui/skeleton";
import { compact, shortAddr, timeAgo } from "@/lib/format";
import { explorerTxUrl } from "@/lib/public-env";
import { fromBaseUnits } from "@/lib/validation";
import { cn } from "@/lib/utils";

interface ProfileResp {
  profile: {
    wallet: string;
    joinedAt: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
    twitter: string | null;
    stats: { clips: number; views: number; likes: number; launches: number };
    launches: { mint: string; name: string; symbol: string; imageUrl: string; clipId: string; signature: string; confirmedAt: string }[];
  };
  clips: ClipCardData[];
}

interface Dashboard {
  clips: (ClipCardData & { isDraft: boolean; processingStatus: string; processingError: string | null; moderationStatus: string })[];
  trades: { id: string; side: string; status: string; transaction_signature: string | null; sol_delta_lamports: string | null; token_delta: string | null; created_at: string; symbol: string; mint_address: string }[];
}

interface LaunchItem {
  attempt_id: string;
  status: string;
  transaction_signature: string | null;
  error_message: string | null;
  created_at: string;
  mint_address: string;
  name: string;
  symbol: string;
  clip_id: string;
}

function Dashboard() {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/api/profile") });
  const launches = useQuery({ queryKey: ["my-launches"], queryFn: () => api<{ items: LaunchItem[] }>("/api/launches"), refetchInterval: 15_000 });
  const [tab, setTab] = useState<"clips" | "launches" | "trades">("clips");
  if (d.isLoading) return <Skeleton className="h-60 rounded-2xl bg-white/[0.03]" />;
  if (d.isError) return <ErrorState message="Could not load your dashboard." onRetry={() => void d.refetch()} />;
  const clips = d.data!.clips;
  const totalViews = clips.reduce((s, c) => s + c.viewCount, 0);
  const totalLikes = clips.reduce((s, c) => s + c.likeCount, 0);
  return (
    <section className="surface rounded-[24px] p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Creator dashboard</h2>
        <div className="flex gap-4 text-sm text-ff-muted">
          <span>{compact(totalViews)} views</span>
          <span>{compact(totalLikes)} likes</span>
        </div>
      </div>
      <div className="mt-4 flex gap-4 border-b border-ff-border text-sm">
        {(["clips", "launches", "trades"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("-mb-px border-b-2 pb-2 capitalize", tab === t ? "border-ff-green" : "border-transparent text-ff-muted")}>
            {t === "clips" ? "My clips & drafts" : t === "launches" ? "Launch history" : "Transactions"}
          </button>
        ))}
      </div>
      {tab === "clips" &&
        (clips.length === 0 ? (
          <EmptyState className="mt-4" title="No clips yet" body="Upload your first gaming moment." action={{ href: "/create", label: "Upload a clip" }} />
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.05]">
            {clips.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" className="h-14 w-10 rounded-md object-cover" /> : <span className="h-14 w-10 rounded-md bg-ff-bg2" />}
                <div className="min-w-0 flex-1">
                  <Link href={`/clip/${c.id}`} className="block truncate text-sm font-medium hover:underline">
                    {c.title}
                  </Link>
                  <div className="text-xs text-ff-muted">
                    {c.processingStatus !== "ready" ? `Processing: ${c.processingStatus}` : c.isDraft ? "Draft" : c.moderationStatus === "approved" ? "Published" : `Moderation: ${c.moderationStatus}`}
                    {c.processingError ? ` — ${c.processingError}` : ""} · {compact(c.viewCount)} views
                  </div>
                </div>
                {c.token ? (
                  <span className="text-xs font-semibold text-ff-green">${c.token.symbol}</span>
                ) : c.processingStatus === "ready" ? (
                  <Link href={`/create?clip=${c.id}`} className="text-xs text-white underline">
                    {c.isDraft ? "Continue" : "Launch token"}
                  </Link>
                ) : null}
                {!c.token && (
                  <button
                    type="button"
                    aria-label="Delete clip"
                    className="text-ff-muted hover:text-ff-red"
                    onClick={async () => {
                      if (!confirm("Delete this clip? This cannot be undone.")) return;
                      try {
                        await api(`/api/clips/${c.id}`, { method: "DELETE" });
                        void qc.invalidateQueries({ queryKey: ["dashboard"] });
                      } catch (e) {
                        toast.error(friendlyWalletError(e));
                      }
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
      {tab === "launches" &&
        (!launches.data?.items.length ? (
          <p className="py-8 text-center text-sm text-ff-muted">No launches yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.05] text-sm">
            {launches.data.items.map((l) => (
              <li key={l.attempt_id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-semibold">${l.symbol}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs", l.status === "confirmed" ? "bg-ff-green/15 text-ff-green" : l.status === "failed" ? "bg-ff-red/15 text-ff-red" : "bg-white/10 text-ff-muted")}>
                  {l.status.replace("_", " ")}
                </span>
                <span className="text-xs text-ff-muted">{timeAgo(l.created_at)}</span>
                {l.error_message && <span className="w-full text-xs text-ff-muted">{l.error_message}</span>}
                {l.transaction_signature && (
                  <a href={explorerTxUrl(l.transaction_signature)} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-xs text-ff-muted hover:text-white">
                    {shortAddr(l.transaction_signature, 5)} <ExternalLink className="size-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ))}
      {tab === "trades" &&
        (!d.data!.trades.length ? (
          <p className="py-8 text-center text-sm text-ff-muted">No trades through Fragfun yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.05] text-sm">
            {d.data!.trades.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className={cn("font-semibold uppercase", t.side === "buy" ? "text-ff-green" : "text-ff-red")}>{t.side}</span>
                <span>${t.symbol}</span>
                <span className="text-xs text-ff-muted">{t.status}</span>
                {t.sol_delta_lamports && <span className="text-xs tabular-nums">{fromBaseUnits(t.sol_delta_lamports, 9, 4)} SOL</span>}
                <span className="text-xs text-ff-muted">{timeAgo(t.created_at)}</span>
                {t.transaction_signature && (
                  <a href={explorerTxUrl(t.transaction_signature)} target="_blank" rel="noreferrer" className="ml-auto text-xs text-ff-muted hover:text-white">
                    View
                  </a>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}

export function ProfileView({ wallet }: { wallet: string }) {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["profile", wallet], queryFn: () => api<ProfileResp>(`/api/profiles/${wallet}`) });
  const isOwner = user?.wallet === wallet;
  if (q.isLoading) return <Skeleton className="h-40 rounded-2xl bg-white/[0.03]" />;
  if (q.isError) {
    if (q.error instanceof ClientApiError && q.error.status === 404) {
      if (isOwner) return <div className="space-y-6"><p className="text-ff-muted">Your profile is ready.</p><CreatorFeesPanel /><Dashboard /></div>;
      return <EmptyState title="Creator not found" body="This wallet hasn't joined Fragfun yet." action={{ href: "/explore", label: "Explore" }} />;
    }
    return <ErrorState message="Could not load profile." onRetry={() => void q.refetch()} />;
  }
  const { profile, clips } = q.data!;
  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-center">
        <Avatar wallet={profile.wallet} url={profile.avatarUrl} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{profile.displayName || (profile.username ? `@${profile.username}` : shortAddr(profile.wallet, 6))}</h1>
          <button
            type="button"
            className="mt-1 flex items-center gap-1 font-mono text-xs text-ff-muted hover:text-white"
            onClick={() => {
              void navigator.clipboard.writeText(profile.wallet);
              toast.success("Address copied");
            }}
          >
            {shortAddr(profile.wallet, 8)} <Copy className="size-3" />
          </button>
          {profile.bio && <p className="mt-2 max-w-xl text-sm text-ff-muted">{profile.bio}</p>}
          <p className="mt-2 text-xs text-ff-muted">
            Joined {new Date(profile.joinedAt).toLocaleDateString()}
            {profile.twitter && (
              <>
                {" · "}
                <a href={`https://x.com/${profile.twitter}`} target="_blank" rel="noreferrer nofollow" className="hover:text-white">
                  @{profile.twitter}
                </a>
              </>
            )}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ["Clips", profile.stats.clips],
            ["Launches", profile.stats.launches],
            ["Views", profile.stats.views],
            ["Likes", profile.stats.likes],
          ].map(([k, v]) => (
            <div key={k} className="surface rounded-2xl px-3 py-2">
              <div className="font-semibold tabular-nums">{compact(v as number)}</div>
              <div className="text-[11px] text-ff-muted">{k}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {isOwner ? (
            <Link
              href="/settings"
              className={cn(
                "inline-flex h-10 items-center rounded-full px-5 text-sm",
                profile.username && profile.avatarUrl ? "btn-ghost" : "btn-glow font-semibold",
              )}
              data-testid="edit-profile"
            >
              {profile.username && profile.avatarUrl ? "Edit profile" : "Complete your profile"}
            </Link>
          ) : (
            <ReportButton targetType="profile" targetId={profile.wallet} />
          )}
        </div>
      </header>

      {isOwner && (
        <div className="space-y-6">
          <CreatorFeesPanel />
          <Dashboard />
        </div>
      )}

      {profile.launches.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Verified launches</h2>
          <div className="flex flex-wrap gap-2">
            {profile.launches.map((l) => (
              <Link key={l.mint} href={`/clip/${l.clipId}`} className="flex items-center gap-2 rounded-full border border-ff-border bg-white/[0.03] py-1 pl-1 pr-3 text-sm hover:bg-white/[0.04]">
                <img src={l.imageUrl} alt="" className="size-7 rounded-full object-cover" />
                <span className="font-semibold">${l.symbol}</span>
                <span className="text-xs text-ff-muted">{timeAgo(l.confirmedAt)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Clips</h2>
        {clips.length ? <ClipGrid clips={clips} /> : <p className="text-sm text-ff-muted">No published clips yet.</p>}
      </section>
    </div>
  );
}
