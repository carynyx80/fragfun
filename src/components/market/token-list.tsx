"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { shortAddr, timeAgo, usd, sol } from "@/lib/format";

export interface TokenListItem {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string;
  clipId: string;
  confirmedAt: string;
  creator: { wallet: string; username: string | null };
  marketCapUsd: number | null;
  marketCapSol: number | null;
  volume24hUsd: number | null;
  lifecycle: string | null;
  curveProgress: number | null;
}

export function TokenList({ items, loading, empty }: { items?: TokenListItem[]; loading?: boolean; empty: string }) {
  if (loading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl bg-white/[0.03]" />
        ))}
      </div>
    );
  if (!items?.length) return <p className="px-4 py-12 text-center text-sm text-white/45">{empty}</p>;
  return (
    <ul className="space-y-0.5">
      {items.map((t) => (
        <li key={t.mint}>
          <Link href={`/clip/${t.clipId}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-white/[0.04]">
            <img src={t.imageUrl} alt="" className="size-11 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">${t.symbol}</span>
                <span className="truncate text-sm text-ff-muted">{t.name}</span>
              </div>
              <div className="text-xs text-ff-muted">
                by {t.creator.username ? `@${t.creator.username}` : shortAddr(t.creator.wallet)} · {timeAgo(t.confirmedAt)}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="num font-medium">{t.marketCapUsd != null ? usd(t.marketCapUsd) : t.marketCapSol != null ? sol(t.marketCapSol, 1) : "—"}</div>
              <div className="text-xs text-ff-muted">{t.volume24hUsd != null ? `Vol ${usd(t.volume24hUsd)}` : t.lifecycle === "migrated" ? "Graduated" : "Market cap"}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
