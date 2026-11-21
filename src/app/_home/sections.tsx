"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { ClipCard, ClipCardSkeleton } from "@/components/clip/clip-card";
import { ErrorState } from "@/components/common/empty-state";
import { TokenList, type TokenListItem } from "@/components/market/token-list";
import { Avatar } from "@/components/common/avatar";
import { Marquee, Reveal } from "@/components/motion/reveal";
import { compact, shortAddr, usd } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { HowBento } from "./bento";

interface Creator {
  wallet: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  publishedClips: number;
  confirmedLaunches: number;
  totalViews: number;
}

function SectionTitle({ eyebrow, title, muted, href, cta = "View all" }: { eyebrow: string; title: string; muted?: string; href?: string; cta?: string }) {
  return (
    <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="h-section mt-3 text-3xl sm:text-[44px]">
          {title} {muted && <span className="text-white/40">{muted}</span>}
        </h2>
      </div>
      {href && (
        <Link href={href} className="group inline-flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white">
          {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </Reveal>
  );
}

/** Real recent launches when they exist; otherwise the categories you can launch into. */
function LiveTicker({ tokens, categories }: { tokens: TokenListItem[]; categories: { slug: string; name: string }[] }) {
  const items =
    tokens.length > 0
      ? tokens.map((t) => (
          <Link key={t.mint} href={`/clip/${t.clipId}`} className="mx-3 flex items-center gap-2.5 rounded-full py-2 pl-2 pr-4 transition-colors hover:bg-white/[0.04]">
            <img src={t.imageUrl} alt="" className="size-7 rounded-full object-cover" />
            <span className="font-mono text-sm font-medium">${t.symbol}</span>
            {t.marketCapUsd != null && <span className="font-mono text-xs text-white/45">{usd(t.marketCapUsd)}</span>}
          </Link>
        ))
      : categories.map((c) => (
          <Link key={c.slug} href={`/explore?category=${c.slug}`} className="mx-6 flex items-center gap-6 py-3 text-white/45 transition-colors hover:text-white">
            <span className="h-section text-2xl sm:text-3xl">{c.name}</span>
            <span className="size-1.5 rounded-full bg-ff-green" />
          </Link>
        ));
  if (!items.length) return null;
  return (
    <div className="-mx-4 border-y border-white/[0.06] py-2 lg:-mx-6">
      <Marquee duration={tokens.length ? 50 : 35}>{items}</Marquee>
    </div>
  );
}

function ClipRail({ clips, loading }: { clips?: ClipCardData[]; loading: boolean }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:-mx-6 lg:px-6">
      {loading
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-[62%] shrink-0 snap-start sm:w-[34%] lg:w-[23%]">
              <ClipCardSkeleton />
            </div>
          ))
        : clips?.map((c, i) => (
            <div key={c.id} className="w-[62%] shrink-0 snap-start sm:w-[34%] lg:w-[23%]">
              <ClipCard clip={c} priority={i < 3} />
            </div>
          ))}
    </div>
  );
}

export function HomeSections() {
  const trending = useQuery({ queryKey: ["trending"], queryFn: () => api<{ items: ClipCardData[] }>("/api/clips/trending") });
  const latest = useQuery({ queryKey: ["clips", "new"], queryFn: () => api<{ items: ClipCardData[] }>("/api/clips?sort=new&limit=10") });
  const recent = useQuery({ queryKey: ["tokens", "recent"], queryFn: () => api<{ items: TokenListItem[] }>("/api/tokens?kind=recent") });
  const hot = useQuery({ queryKey: ["tokens", "hot"], queryFn: () => api<{ items: TokenListItem[] }>("/api/tokens?kind=hot") });
  const board = useQuery({ queryKey: ["leaderboard"], queryFn: () => api<{ creators: Creator[] }>("/api/leaderboard") });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<{ items: { slug: string; name: string }[] }>("/api/categories") });

  const hasTrending = (trending.data?.items.length ?? 0) > 0;
  const clips = hasTrending ? trending.data?.items : latest.data?.items;
  const clipsLoading = trending.isLoading || (!hasTrending && latest.isLoading);

  return (
    <div className="mt-24 space-y-28 sm:mt-28">
      <LiveTicker tokens={recent.data?.items ?? []} categories={cats.data?.items ?? []} />

      <section>
        <SectionTitle
          eyebrow={hasTrending ? "Trending · last 24h" : "Fresh drops"}
          title={hasTrending ? "What everyone's" : "Just"}
          muted={hasTrending ? "rewinding." : "uploaded."}
          href="/explore?sort=trending"
        />
        {trending.isError && latest.isError ? (
          <ErrorState message="Could not load clips." onRetry={() => void trending.refetch()} />
        ) : !clipsLoading && !clips?.length ? (
          <Reveal>
            <Link href="/create" className="surface group flex flex-col items-start justify-between gap-6 rounded-[28px] p-8 sm:flex-row sm:items-center sm:p-10">
              <div>
                <p className="h-section text-3xl">No clips yet.</p>
                <p className="mt-2 text-white/55">Be the first to turn a gaming moment into a market.</p>
              </div>
              <span className="btn-glow inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold">
                Launch the first one <ArrowUpRight className="size-4" />
              </span>
            </Link>
          </Reveal>
        ) : (
          <ClipRail clips={clips} loading={clipsLoading} />
        )}
      </section>

      <HowBento />

      <section>
        <SectionTitle eyebrow="Markets" title="On-chain," muted="not made up." href="/leaderboard" cta="Full leaderboard" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Reveal>
            <div className="surface rounded-[28px] p-2">
              <div className="flex items-center justify-between px-4 pb-2 pt-4">
                <h3 className="text-[15px] font-medium">Recently launched</h3>
                <span className="font-mono text-[11px] text-white/35">verified on Solana</span>
              </div>
              <TokenList items={recent.data?.items} loading={recent.isLoading} empty="No tokens launched yet." />
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="surface rounded-[28px] p-2">
              <div className="flex items-center justify-between px-4 pb-2 pt-4">
                <h3 className="text-[15px] font-medium">Hot markets</h3>
                <span className="font-mono text-[11px] text-white/35">24h volume · GeckoTerminal</span>
              </div>
              <TokenList items={hot.data?.items} loading={hot.isLoading} empty="No trading volume recorded yet." />
            </div>
          </Reveal>
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Creators" title="The people" muted="behind the plays." href="/leaderboard" />
        {board.isLoading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-[24px] bg-white/[0.03]" />
            ))}
          </div>
        ) : !board.data?.creators.length ? (
          <p className="surface rounded-[24px] px-6 py-10 text-center text-sm text-white/50">Creators show up here once they publish clips.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {board.data.creators.slice(0, 6).map((c, i) => (
              <Reveal key={c.wallet} delay={i * 0.05}>
                <Link href={`/profile/${c.wallet}`} className="surface group block rounded-[24px] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-white/15">
                  <Avatar wallet={c.wallet} url={c.avatarUrl} size={52} />
                  <div className="mt-4 truncate font-medium">{c.displayName || (c.username ? `@${c.username}` : shortAddr(c.wallet))}</div>
                  <div className="mt-1 font-mono text-[11px] text-white/40">
                    {c.publishedClips} clips · {c.confirmedLaunches} launches
                  </div>
                  <div className="font-mono text-[11px] text-white/40">{compact(c.totalViews)} views</div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      <Reveal>
        <section className="relative overflow-hidden rounded-[36px] border border-white/[0.07] px-6 py-16 text-center sm:px-12 sm:py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_100%,rgba(139,255,22,0.16),transparent_70%)]" />
          <div className="relative">
            <p className="eyebrow">Your turn</p>
            <h2 className="display mx-auto mt-5 max-w-3xl text-[clamp(2.6rem,7vw,5.5rem)]">
              That clip in your camera roll<span className="text-ff-green">?</span>
              <span className="block text-white/40">It wants a ticker.</span>
            </h2>
            <Link href="/create" className="btn-glow mt-10 inline-flex h-12 items-center gap-2 rounded-full px-7 text-[15px] font-semibold">
              Launch a Clip <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
