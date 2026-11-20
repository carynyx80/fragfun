"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Upload, Coins, Rocket, LineChart } from "lucide-react";
import { api } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { ClipGrid } from "@/components/clip/clip-card";
import { EmptyState, ErrorState, SectionHeader } from "@/components/common/empty-state";
import { TokenList, type TokenListItem } from "@/components/market/token-list";
import { Avatar } from "@/components/common/avatar";
import { compact, shortAddr } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

interface Creator {
  wallet: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  publishedClips: number;
  confirmedLaunches: number;
  totalViews: number;
}

export function HomeSections() {
  const trending = useQuery({ queryKey: ["trending"], queryFn: () => api<{ items: ClipCardData[] }>("/api/clips/trending") });
  const latest = useQuery({ queryKey: ["clips", "new"], queryFn: () => api<{ items: ClipCardData[] }>("/api/clips?sort=new&limit=10") });
  const recent = useQuery({ queryKey: ["tokens", "recent"], queryFn: () => api<{ items: TokenListItem[] }>("/api/tokens?kind=recent") });
  const hot = useQuery({ queryKey: ["tokens", "hot"], queryFn: () => api<{ items: TokenListItem[] }>("/api/tokens?kind=hot") });
  const board = useQuery({ queryKey: ["leaderboard"], queryFn: () => api<{ creators: Creator[] }>("/api/leaderboard") });

  // Trending needs real engagement; fall back to newest clips (labelled honestly) when there is none yet.
  const hasTrending = (trending.data?.items.length ?? 0) > 0;
  const clips = hasTrending ? trending.data?.items : latest.data?.items;

  return (
    <div className="space-y-16">
      <section>
        <SectionHeader
          title={hasTrending ? "Trending clips" : "Latest clips"}
          subtitle={hasTrending ? "Ranked by recent views, likes and verified market activity" : "No engagement data yet — showing the newest clips"}
          href="/explore?sort=trending"
        />
        {trending.isError && latest.isError ? (
          <ErrorState message="Could not load clips." onRetry={() => void trending.refetch()} />
        ) : !trending.isLoading && !latest.isLoading && !clips?.length ? (
          <EmptyState title="No clips yet" body="No clips launched yet. Be the first to turn a gaming moment into a market." action={{ href: "/create", label: "Launch a Clip" }} />
        ) : (
          <ClipGrid clips={clips} loading={trending.isLoading || (!hasTrending && latest.isLoading)} count={5} />
        )}
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div>
          <SectionHeader title="Recently launched" subtitle="Tokens created through Fragfun and verified on-chain" href="/activity" />
          <TokenList items={recent.data?.items} loading={recent.isLoading} empty="No tokens launched yet." />
        </div>
        <div>
          <SectionHeader title="Hot markets" subtitle="By 24h trading volume (GeckoTerminal) and Fragfun traders" href="/leaderboard" />
          <TokenList items={hot.data?.items} loading={hot.isLoading} empty="No market activity recorded yet." />
        </div>
      </section>

      <section>
        <SectionHeader title="Featured creators" subtitle="Ranked by verified launches, published clips and genuine engagement" href="/leaderboard" />
        {board.isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl bg-ff-card" />
            ))}
          </div>
        ) : !board.data?.creators.length ? (
          <p className="rounded-xl border border-dashed border-ff-border px-4 py-8 text-center text-sm text-ff-muted">Creators appear here once they publish clips.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {board.data.creators.slice(0, 6).map((c) => (
              <Link key={c.wallet} href={`/profile/${c.wallet}`} className="rounded-2xl border border-ff-border bg-ff-card p-4 text-center hover:bg-[#1a1a1a]">
                <Avatar wallet={c.wallet} url={c.avatarUrl} size={48} className="mx-auto" />
                <div className="mt-2 truncate text-sm font-medium">{c.displayName || (c.username ? `@${c.username}` : shortAddr(c.wallet))}</div>
                <div className="mt-1 text-xs text-ff-muted">
                  {c.publishedClips} clips · {c.confirmedLaunches} launches
                </div>
                <div className="text-xs text-ff-muted">{compact(c.totalViews)} views</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section id="how">
        <SectionHeader title="How Fragfun works" />
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Upload, t: "Upload a clip", d: "Drop in a gaming moment you own. We process it for fast playback." },
            { icon: Coins, t: "Create your token", d: "Name it, pick a ticker and image. Optional AI help, always editable." },
            { icon: Rocket, t: "Launch on Solana", d: "Your wallet signs a Pump.fun create transaction. No keys leave your wallet." },
            { icon: LineChart, t: "Discover & trade", d: "Every clip gets a market page with live data and a trading panel." },
          ].map((s, i) => (
            <li key={s.t} className="rounded-2xl border border-ff-border bg-ff-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-[#1f1f1f]">
                  <s.icon className="size-[18px]" />
                </span>
                <span className="text-xs text-ff-muted">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 font-medium">{s.t}</h3>
              <p className="mt-1 text-sm text-ff-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
