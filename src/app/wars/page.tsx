"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Swords, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, friendlyWalletError } from "@/lib/client";
import type { ClipCardData } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { VideoPlayer } from "@/components/clip/video-player";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { compact, usd, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/empty-state";

interface War {
  id: string;
  title: string | null;
  status: "active" | "ended";
  endsAt: string;
  a: { clip: ClipCardData; votes: number };
  b: { clip: ClipCardData; votes: number };
  myVote: string | null;
}

function Side({ war, side }: { war: War; side: "a" | "b" }) {
  const { user, signIn } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const s = war[side];
  const total = war.a.votes + war.b.votes;
  const pct = total ? Math.round((s.votes / total) * 100) : 50;
  const mine = war.myVote === s.clip.id;
  return (
    <div className={cn("surface flex-1 rounded-[26px] p-3", mine && "border-ff-green/60")}>
      <VideoPlayer source={s.clip.playback} poster={s.clip.thumbnailUrl} className="aspect-[9/14] w-full rounded-xl" />
      <Link href={`/clip/${s.clip.id}`} className="mt-3 block truncate font-medium hover:underline">
        {s.clip.title}
      </Link>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-ff-muted">
        <dt>Views</dt>
        <dd className="text-right text-white">{compact(s.clip.viewCount)}</dd>
        <dt>Likes</dt>
        <dd className="text-right text-white">{compact(s.clip.likeCount)}</dd>
        <dt>Token</dt>
        <dd className="text-right text-white">{s.clip.token ? `$${s.clip.token.symbol}` : "—"}</dd>
        <dt>24h volume</dt>
        <dd className="text-right text-white">{usd(s.clip.market?.volume24hUsd)}</dd>
      </dl>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ff-bg2">
        <div className="h-full bg-ff-green" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-ff-muted">
        {s.votes} votes · {pct}%
      </div>
      {war.status === "active" && (
        <Button
          className="mt-3 h-9 w-full rounded-full font-semibold"
          variant={mine ? "default" : "outline"}
          disabled={busy || Boolean(war.myVote)}
          onClick={async () => {
            if (!user) return void signIn();
            setBusy(true);
            try {
              await api(`/api/wars/${war.id}/vote`, { method: "POST", json: { clipId: s.clip.id } });
              await qc.invalidateQueries({ queryKey: ["wars"] });
            } catch (e) {
              toast.error(friendlyWalletError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {mine ? "Your vote" : war.myVote ? "Voted" : "Vote"}
        </Button>
      )}
    </div>
  );
}

function CreateWar({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const clips = useQuery({ queryKey: ["clips", "views", "war"], queryFn: () => api<{ items: ClipCardData[] }>("/api/clips?sort=views&limit=30"), enabled: open });
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-white/[0.08] bg-[#0b0b0b] rounded-[28px] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start a Clip War</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-ff-muted">Pick two published clips. The community votes for 24 hours. Votes are free and have no financial stake.</p>
        <div className="grid grid-cols-1 gap-1">
          {clips.data?.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => (a === c.id ? setA(null) : b === c.id ? setB(null) : !a ? setA(c.id) : setB(c.id))}
              className={cn("flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm", a === c.id || b === c.id ? "border-ff-green" : "border-ff-border")}
            >
              <span className="truncate">{c.title}</span>
              <span className="text-xs text-ff-muted">{a === c.id ? "A" : b === c.id ? "B" : ""}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button
            disabled={!a || !b || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/wars", { method: "POST", json: { clipAId: a, clipBId: b, durationHours: 24 } });
                await qc.invalidateQueries({ queryKey: ["wars"] });
                onOpenChange(false);
              } catch (e) {
                toast.error(friendlyWalletError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} Start war
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WarsPage() {
  const { user, signIn } = useAuth();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["wars"], queryFn: () => api<{ items: War[]; enabled: boolean }>("/api/wars"), refetchInterval: 20_000 });
  return (
    <div className="mx-auto max-w-5xl px-4 pb-8">
      <PageHeader eyebrow="Head to head" title="Clip Wars" description="Two clips, one community vote. A social face-off — no wagers, no pools, no stakes.">
        <Button className="h-11 rounded-full px-5" onClick={() => (user ? setOpen(true) : void signIn())}>
          <Swords /> Start a war
        </Button>
      </PageHeader>
      <div className="mt-6 space-y-8">
        {q.isLoading ? (
          <Skeleton className="h-96 rounded-2xl bg-white/[0.03]" />
        ) : q.isError ? (
          <ErrorState message="Could not load Clip Wars." onRetry={() => void q.refetch()} />
        ) : !q.data!.items.length ? (
          <EmptyState title="No Clip Wars yet" body="Start the first face-off between two published clips." />
        ) : (
          q.data!.items.map((w) => (
            <section key={w.id}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{w.title ?? `${w.a.clip.title} vs ${w.b.clip.title}`}</span>
                <span className="text-xs text-ff-muted">{w.status === "active" ? `Ends ${new Date(w.endsAt).toLocaleString()}` : `Ended ${timeAgo(w.endsAt)}`}</span>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Side war={w} side="a" />
                <div className="flex items-center justify-center text-sm font-bold text-ff-muted">VS</div>
                <Side war={w} side="b" />
              </div>
            </section>
          ))
        )}
      </div>
      <CreateWar open={open} onOpenChange={setOpen} />
    </div>
  );
}
