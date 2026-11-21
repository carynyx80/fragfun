"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Volume2, VolumeX } from "lucide-react";
import { api } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { VideoPlayer, type VideoPlayerHandle } from "./video-player";
import { LikeButton, ReportButton, ShareButton, trackView } from "./engagement";
import { Avatar } from "@/components/common/avatar";
import { creatorName, usd } from "@/lib/format";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

function FeedItem({ clip, active, muted, onToggleMute }: { clip: ClipCardData; active: boolean; muted: boolean; onToggleMute: () => void }) {
  const ref = useRef<VideoPlayerHandle>(null);
  useEffect(() => {
    if (active) ref.current?.play();
    else ref.current?.pause();
  }, [active]);
  return (
    <section className="relative h-full w-full snap-start snap-always" data-testid="feed-item">
      {/* Only the active and adjacent items mount a player (see parent), others show the poster. */}
      <VideoPlayer
        ref={ref}
        source={clip.playback}
        poster={clip.thumbnailUrl}
        muted={muted}
        controls={false}
        fit="contain"
        className="absolute inset-0 size-full"
        onPlayed={() => trackView(clip.id)}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 pb-6 pr-20">
        <Link href={`/profile/${clip.creator.wallet}`} className="pointer-events-auto flex items-center gap-2 text-sm font-medium">
          <Avatar wallet={clip.creator.wallet} url={clip.creator.avatarUrl} size={28} />
          {creatorName(clip.creator)}
        </Link>
        <p className="mt-2 line-clamp-2 text-[15px] font-medium">{clip.title}</p>
        {clip.token ? (
          <Link
            href={`/clip/${clip.id}#trade`}
            className="pointer-events-auto mt-3 inline-flex items-center gap-2 rounded-full bg-ff-green py-1.5 pl-1.5 pr-4 text-sm font-semibold text-black"
          >
            <img src={clip.token.imageUrl} alt="" className="size-6 rounded-full object-cover" />
            Trade ${clip.token.symbol}
            {clip.market?.marketCapUsd != null && <span className="font-normal opacity-70">MC {usd(clip.market.marketCapUsd)}</span>}
          </Link>
        ) : (
          <span className="mt-3 inline-block rounded-full border border-white/20 px-3 py-1 text-xs text-white/70">No token yet</span>
        )}
      </div>
      <div className="absolute bottom-6 right-3 flex flex-col items-center gap-4">
        <LikeButton clipId={clip.id} initialLiked={false} initialCount={clip.likeCount} vertical />
        <ShareButton clipId={clip.id} title={clip.title} vertical />
        <ReportButton targetType="clip" targetId={clip.id} vertical />
        <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={onToggleMute} className="flex size-10 items-center justify-center rounded-full bg-white/10 backdrop-blur">
          {muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
        </button>
      </div>
    </section>
  );
}

/** Vertical, snap-scrolling short-video feed with lazy pagination and viewport-driven autoplay. */
export function VerticalFeed({ category }: { category?: string }) {
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const q = useInfiniteQuery({
    queryKey: ["feed", category ?? "all"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<{ items: ClipCardData[]; nextOffset: number | null }>(`/api/clips?sort=new&limit=6&offset=${pageParam}${category ? `&category=${category}` : ""}`),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const clips = q.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("[data-index]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [clips.length]);

  useEffect(() => {
    if (active >= clips.length - 2 && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [active, clips.length, q]);

  if (q.isLoading) return <Skeleton className="mx-auto h-[calc(100dvh-9rem)] w-full max-w-[460px] rounded-2xl bg-white/[0.03]" />;
  if (q.isError) return <ErrorState message="Could not load the feed." onRetry={() => void q.refetch()} />;
  if (!clips.length)
    return <EmptyState title="No clips yet" body="No clips launched yet. Be the first to turn a gaming moment into a market." action={{ href: "/create", label: "Launch a clip" }} />;

  return (
    <div
      ref={container}
      className="no-scrollbar mx-auto h-[calc(100dvh-9rem)] w-full max-w-[460px] snap-y snap-mandatory overflow-y-scroll rounded-2xl border border-ff-border bg-black"
    >
      {clips.map((c, i) => (
        <div key={c.id} data-index={i} className="h-full">
          {Math.abs(i - active) <= 1 ? (
            <FeedItem clip={c} active={i === active} muted={muted} onToggleMute={() => setMuted((m) => !m)} />
          ) : (
            <div className="relative h-full snap-start">{c.thumbnailUrl && <img src={c.thumbnailUrl} alt="" className="size-full object-contain" />}</div>
          )}
        </div>
      ))}
    </div>
  );
}
