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
  if (!clip.token) return <span className="rounded-full bg-black/45 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white/60 backdrop-blur-md">No token</span>;
  const lc = clip.market?.lifecycle;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white backdrop-blur-md">
      <span className="size-1.5 rounded-full bg-ff-green" />
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
        className="relative block aspect-[9/14] overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0b0b0b] transition-[transform,border-color] duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 hover:border-white/15"
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
            className={cn("absolute inset-0 size-full object-cover transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]", hover && canPreview && "opacity-0")}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-center bg-[radial-gradient(120%_70%_at_30%_10%,#1c1c1c,#080808)] p-5">
            <span className="h-section line-clamp-4 text-[22px] leading-[1.05] text-white/80">{clip.title}</span>
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
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-white/70">
            <span className="flex items-center gap-1">
              <Eye className="size-3" /> {compact(clip.viewCount)}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-3" /> {compact(clip.likeCount)}
            </span>
          </div>
          <div className="absolute right-3 bottom-3 flex size-10 translate-y-2 items-center justify-center rounded-full bg-white text-black opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100" aria-hidden>
            <Play className="size-4 fill-black" />
          </div>
        </div>
      </Link>
      <div className="mt-3 flex gap-3 px-0.5">
        {clip.token ? (
          <img src={clip.token.imageUrl} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
        ) : (
          <Avatar wallet={clip.creator.wallet} url={clip.creator.avatarUrl} size={36} />
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/clip/${clip.id}`} className="line-clamp-1 text-[14.5px] font-medium tracking-tight">
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
            <div className="num mt-1.5 flex items-center gap-2 text-[11.5px]">
              <span className="text-ff-green">${clip.token.symbol}</span>
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
      <Skeleton className="aspect-[9/14] rounded-[22px] bg-white/[0.03]" />
      <div className="mt-3 flex gap-3 px-0.5">
        <Skeleton className="size-9 rounded-xl bg-white/[0.03]" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4 bg-white/[0.03]" />
          <Skeleton className="h-3 w-1/2 bg-white/[0.03]" />
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
