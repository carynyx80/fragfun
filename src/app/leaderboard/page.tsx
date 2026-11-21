"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { Avatar } from "@/components/common/avatar";
import { ErrorState } from "@/components/common/empty-state";
import { TokenList, type TokenListItem } from "@/components/market/token-list";
import { Skeleton } from "@/components/ui/skeleton";
import { compact, shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/empty-state";

interface Creator {
  wallet: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  publishedClips: number;
  confirmedLaunches: number;
  totalViews: number;
  totalLikes: number;
  score: number;
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<"creators" | "tokens" | "clips">("creators");
  const q = useQuery({ queryKey: ["leaderboard"], queryFn: () => api<{ creators: Creator[]; tokens: TokenListItem[]; clips: ClipCardData[] }>("/api/leaderboard") });
  return (
    <div className="mx-auto max-w-4xl px-4 pb-8">
      <PageHeader
        eyebrow="Rankings"
        title="Leaderboard"
        description="Transparent rankings from deduplicated engagement and verified on-chain activity. A high rank says nothing about a token's quality or future price."
      />
      <div className="flex gap-6 border-b border-white/[0.07] text-sm">
        {(["creators", "tokens", "clips"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={cn("-mb-px border-b-2 pb-3 capitalize transition-colors", tab === t ? "border-ff-green" : "border-transparent text-white/45 hover:text-white/80")}>
            {t === "tokens" ? "Trending tokens" : t === "clips" ? "Trending clips" : "Top creators"}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message="Could not load the leaderboard." onRetry={() => void q.refetch()} />
        ) : tab === "creators" ? (
          q.data!.creators.length ? (
            <ol className="surface divide-y divide-white/[0.05] overflow-hidden rounded-[24px]">
              {q.data!.creators.map((c, i) => (
                <li key={c.wallet}>
                  <Link href={`/profile/${c.wallet}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04]">
                    <span className={cn("w-6 text-center text-sm font-semibold tabular-nums", i < 3 ? "text-ff-green" : "text-ff-muted")}>{i + 1}</span>
                    <Avatar wallet={c.wallet} url={c.avatarUrl} size={36} />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.displayName || (c.username ? `@${c.username}` : shortAddr(c.wallet))}</span>
                    <span className="hidden text-xs text-ff-muted sm:inline">
                      {c.publishedClips} clips · {c.confirmedLaunches} launches · {compact(c.totalViews)} views
                    </span>
                    <span className="w-14 text-right text-sm tabular-nums">{c.score.toFixed(1)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-10 text-center text-sm text-ff-muted">No creators ranked yet.</p>
          )
        ) : tab === "tokens" ? (
          <TokenList items={q.data!.tokens} empty="No tokens with recorded 24h trading volume yet." />
        ) : q.data!.clips.length ? (
          <ol className="divide-y divide-white/[0.05] overflow-hidden surface rounded-[24px]">
            {q.data!.clips.map((c, i) => (
              <li key={c.id}>
                <Link href={`/clip/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04]">
                  <span className="w-6 text-center text-sm font-semibold text-ff-muted">{i + 1}</span>
                  {c.thumbnailUrl && <img src={c.thumbnailUrl} alt="" className="h-12 w-9 rounded object-cover" />}
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="text-xs text-ff-muted">{compact(c.viewCount)} views</span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-10 text-center text-sm text-ff-muted">No clips trending in the last 24 hours.</p>
        )}
      </div>
      <details className="mt-8 rounded-xl border border-ff-border p-4 text-sm text-ff-muted">
        <summary className="cursor-pointer text-white">How rankings work</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Creators: 5 × verified launches + 2 × published clips + 3 × ln(1 + views) + 5 × ln(1 + likes).</li>
          <li>Clips: (24h views + 4 × likes + 3 × shares + 2 × Clip War votes + 10 × ln(1 + 24h volume USD)) ÷ (age in hours + 2)^1.3.</li>
          <li>Tokens: ln(1 + 24h volume USD) × (1 + 0.1 × unique Fragfun traders) ÷ √(age in days + 1).</li>
          <li>Views count once per visitor per hour, likes once per account. Volume comes from on-chain data via GeckoTerminal.</li>
        </ul>
      </details>
    </div>
  );
}
