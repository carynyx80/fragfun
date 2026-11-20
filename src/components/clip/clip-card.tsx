"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRef, useState } from "react";
import { Eye, Heart, Play } from "lucide-react";
import type { ClipCardData } from "@/lib/types";
import { compact, creatorName, usd, sol, timeAgo } from "@/lib/format";
import { Avatar } from "@/components/common/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LaunchBadge({ clip }: { clip: Pick<ClipCardData, "token" | "market"> }) {
  if (!clip.token) return <span className="rounded-full border border-ff-border bg-black/60 px-2 py-0.5 text-[11px] text-ff-muted backdrop-blur">Not launched</span>;
  const lc = clip.market?.lifecycle;
  return (
    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-ff-green backdrop-blur">
      {lc === "migrated" ? "Graduated" : "Live"} · ${clip.token.symbol}
    </span>
  );
}

export function ClipCard({ clip, priority }: { clip: ClipCardData; priority?: boolean }) {
  const [hover, setHover] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);
  const canPreview = clip.playback?.type === "file"; // HLS previews would require hls.js per card; posters only.
  return (
    <article className="group" data-testid="clip-card">
      <Link
        href={`/clip/${clip.id}`}
        className="relative block aspect-[9/14] overflow-hidden rounded-2xl border border-ff-border bg-ff-card"
        onMouseEnter={() => {
          setHover(true);
          if (canPreview) void vref.current?.play().catch(() => undefined);
        }}
        onMouseLeave={() => {
          setHover(false);
          vref.current?.pause();
        }}
      >
        {clip.thumbnailUrl ? (
          <img
            src={clip.thumbnailUrl}
            alt=""
            loading={priority ? "eager" : "lazy"}
            className={cn("absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]", hover && canPreview && "opacity-0")}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ff-muted">
            <Play className="size-8" />
          </div>
        )}
        {canPreview && clip.playback && (
          <video ref={vref} src={hover ? clip.playback.src : undefined} muted loop playsInline preload="none" className={cn("absolute inset-0 size-full object-cover", !hover && "hidden")} />
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <LaunchBadge clip={clip} />
          {clip.durationSeconds ? (
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-[11px] tabular-nums text-white/80 backdrop-blur">
              0:{String(Math.round(clip.durationSeconds)).padStart(2, "0")}
            </span>
          ) : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3 pt-10">
          <div className="flex items-center gap-1.5 text-[11px] text-white/70">
            <span className="flex items-center gap-1">
              <Eye className="size-3" /> {compact(clip.viewCount)}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-3" /> {compact(clip.likeCount)}
            </span>
          </div>
          <div className="mt-1 flex size-9 items-center justify-center rounded-full bg-white/15 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100" aria-hidden>
            <Play className="size-4" />
          </div>
        </div>
      </Link>
      <div className="mt-2.5 flex gap-2.5">
        {clip.token ? (
          <img src={clip.token.imageUrl} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
        ) : (
          <Avatar wallet={clip.creator.wallet} url={clip.creator.avatarUrl} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/clip/${clip.id}`} className="line-clamp-1 text-sm font-medium hover:underline">
            {clip.title}
          </Link>
          <div className="flex items-center gap-1 text-xs text-ff-muted">
            <Link href={`/profile/${clip.creator.wallet}`} className="truncate hover:text-white">
              {creatorName(clip.creator)}
            </Link>
            <span>·</span>
            <span className="shrink-0">{timeAgo(clip.publishedAt)}</span>
          </div>
          {clip.token && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="font-semibold text-white">${clip.token.symbol}</span>
              <span className="text-ff-muted">
                MC {clip.market?.marketCapUsd != null ? usd(clip.market.marketCapUsd) : clip.market?.marketCapSol != null ? sol(clip.market.marketCapSol, 1) : "—"}
              </span>
              {clip.market?.volume24hUsd != null && <span className="text-ff-muted">Vol {usd(clip.market.volume24hUsd)}</span>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function ClipCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-[9/14] rounded-2xl bg-ff-card" />
      <div className="mt-2.5 flex gap-2.5">
        <Skeleton className="size-9 rounded-lg bg-ff-card" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4 bg-ff-card" />
          <Skeleton className="h-3 w-1/2 bg-ff-card" />
        </div>
      </div>
    </div>
  );
}

export function ClipGrid({ clips, loading, count = 8, className }: { clips?: ClipCardData[]; loading?: boolean; count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:gap-x-4 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {loading ? Array.from({ length: count }).map((_, i) => <ClipCardSkeleton key={i} />) : clips?.map((c, i) => <ClipCard key={c.id} clip={c} priority={i < 4} />)}
    </div>
  );
}
