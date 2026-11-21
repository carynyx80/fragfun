"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Eye, Rocket } from "lucide-react";
import { api, ClientApiError } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { VideoPlayer } from "@/components/clip/video-player";
import { LikeButton, ReportButton, ShareButton, trackView } from "@/components/clip/engagement";
import { ClipCard } from "@/components/clip/clip-card";
import { Avatar } from "@/components/common/avatar";
import { TokenMarket } from "@/components/market/token-market";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { compact, creatorName, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Resp {
  clip: ClipCardData & { isOwner: boolean; isPublic: boolean; isDraft: boolean; processingStatus: string; moderationStatus: string };
  liked: boolean;
  related: ClipCardData[];
}

export function ClipView({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["clip-page", id], queryFn: () => api<Resp>(`/api/clips/${id}`) });
  if (q.isLoading)
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
        <Skeleton className="aspect-video rounded-2xl bg-white/[0.03]" />
        <Skeleton className="h-[600px] rounded-2xl bg-white/[0.03]" />
      </div>
    );
  if (q.isError) {
    if (q.error instanceof ClientApiError && q.error.status === 404)
      return <EmptyState title="Clip not found" body="It may have been removed or is not published yet." action={{ href: "/explore", label: "Explore clips" }} />;
    return <ErrorState message="Could not load this clip." onRetry={() => void q.refetch()} />;
  }
  const { clip, liked, related } = q.data!;
  const launched = clip.token?.status === "confirmed";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
      <div className="min-w-0 space-y-5">
        <div className="overflow-hidden rounded-2xl border border-ff-border bg-black">
          <VideoPlayer source={clip.playback} poster={clip.thumbnailUrl} autoPlay className="aspect-[9/16] max-h-[78vh] w-full sm:aspect-video" onPlayed={() => clip.isPublic && trackView(clip.id)} />
        </div>
        {!clip.isPublic && (
          <p className="surface rounded-2xl px-4 py-3 text-sm text-ff-muted">
            {clip.isDraft ? "This clip is a draft and only visible to you." : `Status: ${clip.moderationStatus}.`}
          </p>
        )}
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{clip.title}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-ff-muted">
            <span className="flex items-center gap-1">
              <Eye className="size-4" /> {compact(clip.viewCount)} views
            </span>
            <span>{timeAgo(clip.publishedAt)}</span>
            {clip.category && (
              <Link href={`/explore?category=${clip.category.slug}`} className="rounded-full border border-ff-border px-2 py-0.5 text-xs hover:text-white">
                {clip.category.name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href={`/profile/${clip.creator.wallet}`} className="flex items-center gap-3">
            <Avatar wallet={clip.creator.wallet} url={clip.creator.avatarUrl} size={40} />
            <div>
              <div className="font-medium">{creatorName(clip.creator)}</div>
              <div className="text-xs text-ff-muted">Creator</div>
            </div>
          </Link>
          {clip.isPublic && (
            <div className="flex items-center gap-4">
              <LikeButton clipId={clip.id} initialLiked={liked} initialCount={clip.likeCount} />
              <ShareButton clipId={clip.id} title={clip.title} />
              <ReportButton targetType="clip" targetId={clip.id} />
            </div>
          )}
        </div>
        {clip.description && <p className="whitespace-pre-line text-sm text-ff-muted">{clip.description}</p>}

        {related.length > 0 && (
          <section className="pt-4">
            <h2 className="mb-3 font-semibold">More clips</h2>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
              {related.map((c) => (
                <ClipCard key={c.id} clip={c} />
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        {launched && clip.token ? (
          <TokenMarket mint={clip.token.mint} compactHeader />
        ) : (
          <div className="surface rounded-[24px] p-6 text-center">
            <Rocket className="mx-auto size-6 text-ff-muted" />
            <p className="mt-3 font-medium">{clip.token ? "Launch in progress" : "No token yet"}</p>
            <p className="mt-1 text-sm text-ff-muted">
              {clip.isOwner ? "Turn this moment into a token on Solana." : "The creator hasn't launched a token for this clip."}
            </p>
            {clip.isOwner && !clip.token && (
              <Link href={`/create?clip=${clip.id}`} className={cn(buttonVariants(), "mt-4 h-10 rounded-full px-5 font-semibold")}>
                Launch token
              </Link>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
