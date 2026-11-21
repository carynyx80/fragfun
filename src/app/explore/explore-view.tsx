"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LayoutGrid, Smartphone, Search, X } from "lucide-react";
import { api, ClientApiError } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { ClipGrid } from "@/components/clip/clip-card";
import { VerticalFeed } from "@/components/clip/vertical-feed";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Avatar } from "@/components/common/avatar";
import { shortAddr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/empty-state";

const SORTS = [
  { key: "trending", label: "Trending" },
  { key: "new", label: "Newest" },
  { key: "views", label: "Most viewed" },
  { key: "launched", label: "Recently launched" },
] as const;

function SearchResults({ term }: { term: string }) {
  const q = useQuery({
    queryKey: ["search", term],
    queryFn: () =>
      api<{
        clips: ClipCardData[];
        tokens: { mint: string; name: string; symbol: string; imageUrl: string; clipId: string }[];
        creators: { wallet: string; username: string | null; displayName: string | null; avatarUrl: string | null }[];
      }>(`/api/search?q=${encodeURIComponent(term)}`),
  });
  if (q.isLoading) return <ClipGrid loading count={5} />;
  if (q.isError) return <ErrorState message={q.error instanceof ClientApiError ? q.error.message : "Search failed."} />;
  const d = q.data!;
  if (!d.clips.length && !d.tokens.length && !d.creators.length) return <EmptyState title={`No results for “${term}”`} body="Try a token ticker, a creator name or a wallet address." />;
  return (
    <div className="space-y-10">
      {d.tokens.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Tokens</h2>
          <div className="flex flex-wrap gap-2">
            {d.tokens.map((t) => (
              <Link key={t.mint} href={`/clip/${t.clipId}`} className="flex items-center gap-2 rounded-full border border-ff-border bg-white/[0.03] py-1 pl-1 pr-3 text-sm hover:bg-white/[0.04]">
                <img src={t.imageUrl} alt="" className="size-7 rounded-full object-cover" />
                <span className="font-semibold">${t.symbol}</span>
                <span className="text-ff-muted">{t.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {d.creators.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Creators</h2>
          <div className="flex flex-wrap gap-2">
            {d.creators.map((c) => (
              <Link key={c.wallet} href={`/profile/${c.wallet}`} className="flex items-center gap-2 rounded-full border border-ff-border bg-white/[0.03] py-1 pl-1 pr-3 text-sm hover:bg-white/[0.04]">
                <Avatar wallet={c.wallet} url={c.avatarUrl} size={28} />
                {c.displayName || (c.username ? `@${c.username}` : shortAddr(c.wallet))}
              </Link>
            ))}
          </div>
        </section>
      )}
      {d.clips.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Clips</h2>
          <ClipGrid clips={d.clips} />
        </section>
      )}
    </div>
  );
}

function Grid({ sort, category }: { sort: string; category?: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => api<{ items: ClipCardData[] }>("/api/clips/trending"),
    enabled: sort === "trending",
  });
  const list = useInfiniteQuery({
    queryKey: ["clips", sort, category],
    initialPageParam: 0,
    enabled: sort !== "trending",
    queryFn: ({ pageParam }) =>
      api<{ items: ClipCardData[]; nextOffset: number | null }>(
        `/api/clips?sort=${sort}&limit=15&offset=${pageParam}${category ? `&category=${category}` : ""}`,
      ),
    getNextPageParam: (l) => l.nextOffset ?? undefined,
  });
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [list]);

  if (sort === "trending") {
    const items = (trending.data?.items ?? []).filter((c) => !category || c.category?.slug === category);
    if (trending.isError) return <ErrorState message="Could not load trending clips." onRetry={() => void trending.refetch()} />;
    if (!trending.isLoading && !items.length)
      return <EmptyState title="Nothing trending yet" body="Trending is based on real views, likes and verified market activity in the last 24 hours." action={{ href: "/explore?sort=new", label: "See newest clips" }} />;
    return <ClipGrid clips={items} loading={trending.isLoading} count={10} />;
  }
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  if (list.isError) return <ErrorState message="Could not load clips." onRetry={() => void list.refetch()} />;
  if (!list.isLoading && !items.length)
    return <EmptyState title="No clips here yet" body="No clips launched yet. Be the first to turn a gaming moment into a market." action={{ href: "/create", label: "Launch a clip" }} />;
  return (
    <>
      <ClipGrid clips={items} loading={list.isLoading} count={10} />
      <div ref={sentinel} className="h-10" />
      {list.isFetchingNextPage && <ClipGrid loading count={5} className="mt-6" />}
    </>
  );
}

export function ExploreView() {
  const params = useSearchParams();
  const router = useRouter();
  const term = params.get("q") ?? "";
  const sort = params.get("sort") ?? "trending";
  const category = params.get("category") ?? undefined;
  const [mode, setMode] = useState<"grid" | "feed">("grid");
  const [input, setInput] = useState(term);
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<{ items: { slug: string; name: string }[] }>("/api/categories") });

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`/explore?${next.toString()}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Discover" title="Explore" muted="the plays." className="pb-2">
        <div className="flex items-center gap-2">
          <form
            className="relative md:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim().length >= 2) setParam("q", input.trim());
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ff-muted" />
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search" className="h-9 w-44 rounded-full border border-white/[0.08] bg-white/[0.03] focus-visible:border-white/25 pl-9 pr-3 text-sm outline-none" />
          </form>
          <div className="glass flex rounded-full p-1">
            <button type="button" aria-label="Grid view" onClick={() => setMode("grid")} className={cn("rounded-full p-2 text-white/50 transition-colors", mode === "grid" && "bg-white text-black")}>
              <LayoutGrid className="size-4" />
            </button>
            <button type="button" aria-label="Feed view" onClick={() => setMode("feed")} className={cn("rounded-full p-2 text-white/50 transition-colors", mode === "feed" && "bg-white text-black")}>
              <Smartphone className="size-4" />
            </button>
          </div>
        </div>
      </PageHeader>

      {term ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-ff-muted">Results for</span>
          <span className="flex items-center gap-1 rounded-full border border-ff-border px-3 py-1">
            {term}
            <button type="button" aria-label="Clear search" onClick={() => setParam("q", null)}>
              <X className="size-3.5" />
            </button>
          </span>
        </div>
      ) : (
        <>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            <button type="button" onClick={() => setParam("category", null)} className={cn("shrink-0 rounded-full px-4 py-2 text-sm transition-colors", !category ? "bg-white font-medium text-black" : "btn-ghost text-white/65")}>
              All
            </button>
            {cats.data?.items.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setParam("category", c.slug)}
                className={cn("shrink-0 rounded-full px-4 py-2 text-sm transition-colors", category === c.slug ? "bg-white font-medium text-black" : "btn-ghost text-white/65 hover:text-white")}
              >
                {c.name}
              </button>
            ))}
          </div>
          {mode === "grid" && (
            <div className="flex gap-6 border-b border-white/[0.07] text-sm">
              {SORTS.map((s) => (
                <button key={s.key} type="button" onClick={() => setParam("sort", s.key)} className={cn("-mb-px border-b-2 pb-3 transition-colors", sort === s.key ? "border-ff-green text-white" : "border-transparent text-white/45 hover:text-white/80")}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {term ? <SearchResults term={term} /> : mode === "feed" ? <VerticalFeed category={category} /> : <Grid sort={sort} category={category} />}
    </div>
  );
}
