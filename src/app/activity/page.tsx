"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Rocket, ArrowLeftRight } from "lucide-react";
import { api } from "@/lib/client";
import { ErrorState, EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { explorerTxUrl } from "@/lib/public-env";
import { shortAddr, timeAgo } from "@/lib/format";
import { fromBaseUnits } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/common/empty-state";

interface Item {
  kind: "launch" | "trade";
  at: string;
  signature: string;
  symbol: string;
  name: string;
  mint_address: string;
  image_url: string;
  clip_id: string;
  wallet_address: string;
  username: string | null;
  side: "buy" | "sell" | null;
  sol_delta: string | null;
}

export default function ActivityPage() {
  const q = useQuery({ queryKey: ["activity"], queryFn: () => api<{ items: Item[] }>("/api/activity"), refetchInterval: 20_000 });
  return (
    <div className="mx-auto max-w-3xl px-4 pb-8">
      <PageHeader eyebrow="Live feed" title="Activity" description="Launches and trades made through Fragfun, each one verified on Solana." />
      <div>
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState message="Could not load activity." onRetry={() => void q.refetch()} />
        ) : !q.data!.items.length ? (
          <EmptyState title="No verified activity yet" body="No clips launched yet. Be the first to turn a gaming moment into a market." action={{ href: "/create", label: "Launch a clip" }} />
        ) : (
          <ul className="surface divide-y divide-white/[0.05] overflow-hidden rounded-[24px]">
            {q.data!.items.map((i) => (
              <li key={`${i.kind}-${i.signature}`} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className={cn("flex size-8 items-center justify-center rounded-lg", i.kind === "launch" ? "bg-ff-green text-black" : "bg-white/10")}>
                  {i.kind === "launch" ? <Rocket className="size-4" /> : <ArrowLeftRight className="size-4" />}
                </span>
                <img src={i.image_url} alt="" className="size-8 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <Link href={`/profile/${i.wallet_address}`} className="font-medium hover:underline">
                      {i.username ? `@${i.username}` : shortAddr(i.wallet_address)}
                    </Link>{" "}
                    {i.kind === "launch" ? "launched" : i.side === "buy" ? "bought" : "sold"}{" "}
                    <Link href={`/clip/${i.clip_id}`} className="font-semibold hover:underline">
                      ${i.symbol}
                    </Link>
                    {i.kind === "trade" && i.sol_delta && <span className="text-ff-muted"> · {fromBaseUnits(i.sol_delta.replace("-", ""), 9, 3)} SOL</span>}
                  </div>
                  <div className="text-xs text-ff-muted">{timeAgo(i.at)}</div>
                </div>
                <a href={explorerTxUrl(i.signature)} target="_blank" rel="noreferrer" aria-label="View transaction" className="text-ff-muted hover:text-white">
                  <ExternalLink className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
