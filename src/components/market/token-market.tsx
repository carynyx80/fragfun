"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import type { MarketData, MarketTrade } from "@/lib/types";
import { PriceChart } from "./price-chart";
import { TradePanel } from "./trade-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { explorerAccountUrl, explorerTxUrl, pumpFunCoinUrl, publicEnv } from "@/lib/public-env";
import { shortAddr, timeAgo, usd, sol, compact } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TokenResp {
  token: {
    mint: string;
    name: string;
    symbol: string;
    description: string;
    imageUrl: string;
    twitter: string | null;
    telegram: string | null;
    website: string | null;
    launchSignature: string;
    confirmedAt: string;
    clipId: string;
    clipTitle: string;
    creator: { wallet: string; username: string | null; displayName: string | null; avatarUrl: string | null };
  };
  market: MarketData;
}

export function useToken(mint: string | null | undefined) {
  return useQuery({
    queryKey: ["token", mint],
    queryFn: () => api<TokenResp>(`/api/tokens/${mint}`),
    enabled: Boolean(mint),
    refetchInterval: 20_000, // server caches on-chain reads; this does not hit RPC every time
  });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.035] px-3 py-2.5">
      <div className="text-[11px] text-ff-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RecentTrades({ mint, symbol }: { mint: string; symbol: string }) {
  const q = useQuery({
    queryKey: ["trades", mint],
    queryFn: () => api<{ trades: MarketTrade[] | null }>(`/api/tokens/${mint}/trades`),
    refetchInterval: 20_000,
  });
  return (
    <div className="surface rounded-[24px]">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium">Recent trades</span>
        <span className="text-[11px] text-ff-muted">On-chain · GeckoTerminal</span>
      </div>
      {q.isLoading ? (
        <div className="space-y-2 px-4 pb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 bg-ff-bg2" />
          ))}
        </div>
      ) : !q.data?.trades?.length ? (
        <p className="px-4 pb-5 text-sm text-ff-muted">No trade data available yet.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-white/[0.05] overflow-y-auto text-xs">
          {q.data.trades.map((t) => (
            <li key={t.signature} className="grid grid-cols-[48px_1fr_1fr_64px] items-center gap-2 px-4 py-2">
              <span className={cn("font-semibold uppercase", t.side === "buy" ? "text-ff-green" : "text-ff-red")}>{t.side}</span>
              <span className="tabular-nums">{t.solAmount != null ? `${t.solAmount.toFixed(3)} SOL` : "—"}</span>
              <span className="truncate tabular-nums text-ff-muted">
                {t.tokenAmount != null ? `${compact(t.tokenAmount)} $${symbol}` : ""}
              </span>
              <a href={explorerTxUrl(t.signature)} target="_blank" rel="noreferrer" className="text-right text-ff-muted hover:text-white">
                {timeAgo(t.timestamp)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TokenMarket({ mint, compactHeader }: { mint: string; compactHeader?: boolean }) {
  const q = useToken(mint);
  if (q.isLoading) return <Skeleton className="h-[640px] rounded-2xl bg-white/[0.03]" />;
  if (q.isError || !q.data) return <p className="rounded-2xl border border-ff-border p-6 text-sm text-ff-muted">Market data unavailable.</p>;
  const { token, market } = q.data;
  return (
    <div className="space-y-4">
      <div className="surface rounded-[24px] p-4">
        <div className="flex items-center gap-3">
          <img src={token.imageUrl} alt="" className="size-12 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="truncate text-lg font-bold">{token.name}</h2>
              <span className="font-semibold text-ff-green">${token.symbol}</span>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 font-mono text-xs text-ff-muted hover:text-white"
              onClick={() => {
                void navigator.clipboard.writeText(token.mint);
                toast.success("Contract address copied");
              }}
            >
              {shortAddr(token.mint, 6)} <Copy className="size-3" />
            </button>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums">{market.priceUsd != null ? usd(market.priceUsd) : sol(market.priceSol, 10)}</div>
            <div className="text-[11px] text-ff-muted">{market.stale ? "Last known price" : "Price"}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Market cap" value={market.marketCapUsd != null ? usd(market.marketCapUsd) : sol(market.marketCapSol, 1)} />
          <Stat label="24h volume" value={usd(market.volume24hUsd)} />
          <Stat label="Liquidity" value={usd(market.liquidityUsd)} />
          <Stat label="Holders" value="Unavailable" />
        </div>
        {market.lifecycle === "bonding_curve" && market.curveProgress != null && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-ff-muted">
              <span>Bonding curve progress</span>
              <span>{(market.curveProgress * 100).toFixed(1)}%</span>
            </div>
            <Progress value={market.curveProgress * 100} />
          </div>
        )}
        {!compactHeader && <p className="mt-3 text-sm text-ff-muted">{token.description}</p>}
      </div>

      <PriceChart mint={mint} />
      <TradePanel mint={mint} symbol={token.symbol} market={market} />
      <RecentTrades mint={mint} symbol={token.symbol} />

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-ff-border bg-ff-border text-sm sm:grid-cols-2">
        {[
          ["Lifecycle", market.lifecycle === "bonding_curve" ? "On Pump.fun bonding curve" : market.lifecycle === "migrated" ? "Graduated to PumpSwap" : "Unknown"],
          ["Created", new Date(token.confirmedAt).toLocaleString()],
          ["Creator", token.creator.username ? `@${token.creator.username}` : shortAddr(token.creator.wallet, 6)],
          ["Data sources", market.sources.join(", ") || "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-white/[0.03] px-4 py-3">
            <dt className="text-xs text-ff-muted">{k}</dt>
            <dd className="mt-0.5 truncate">{k === "Creator" ? <Link href={`/profile/${token.creator.wallet}`} className="hover:underline">{v}</Link> : v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-3 text-xs text-ff-muted">
        <a href={explorerAccountUrl(token.mint)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">
          Solscan <ExternalLink className="size-3" />
        </a>
        <a href={explorerTxUrl(token.launchSignature)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">
          Launch transaction <ExternalLink className="size-3" />
        </a>
        {publicEnv.network === "mainnet-beta" && (
          <a href={pumpFunCoinUrl(token.mint)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-white">
            Pump.fun <ExternalLink className="size-3" />
          </a>
        )}
        {[token.website, token.twitter, token.telegram].filter(Boolean).map((l) => (
          <a key={l} href={l!} target="_blank" rel="noreferrer nofollow" className="flex items-center gap-1 hover:text-white">
            {new URL(l!).hostname} <ExternalLink className="size-3" />
          </a>
        ))}
      </div>
    </div>
  );
}
