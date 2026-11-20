import "server-only";
import { PublicKey } from "@solana/web3.js";
import { env } from "@/lib/env";
import { q, q1 } from "@/lib/db";
import { withRpc } from "@/lib/solana/connection";
import { fetchOnchainMarket } from "@/lib/solana/pump-core";
import type { Candle, MarketData, MarketTrade } from "@/lib/types";

/**
 * Market data. Sources, in order of authority:
 *  1. Solana RPC: the Pump bonding-curve / PumpSwap pool accounts (price, market cap, curve progress).
 *  2. GeckoTerminal public API: 24h volume, liquidity, OHLCV candles, recent trades.
 *  3. CoinGecko: SOL/USD for USD conversions.
 * Nothing is estimated or invented: a field a source cannot provide stays null.
 */

const mem = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  mem.set(key, { at: Date.now(), value });
  return value;
}

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

export async function solUsd(): Promise<number | null> {
  try {
    return await cached("sol-usd", 60_000, async () => {
      const j = await getJson<{ solana?: { usd?: number } }>(env().SOL_USD_PRICE_URL);
      const v = j.solana?.usd;
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("bad price");
      return v;
    });
  } catch {
    return null;
  }
}

interface GtPool {
  id: string;
  attributes: { address: string; volume_usd?: { h24?: string }; reserve_in_usd?: string };
  relationships?: { dex?: { data?: { id?: string } } };
}

async function gtTopPool(mint: string): Promise<GtPool | null> {
  return cached(`gt-pool:${mint}`, 60_000, async () => {
    const j = await getJson<{ data?: GtPool[] }>(`${env().GECKOTERMINAL_API_URL}/networks/solana/tokens/${mint}/pools?page=1`);
    return j.data?.[0] ?? null;
  });
}

const n = (v: unknown) => {
  const x = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : null;
};

export async function getMarket(mint: string, opts: { force?: boolean } = {}): Promise<MarketData> {
  const ttl = env().MARKET_CACHE_SECONDS * 1000;
  const last = await q1<Record<string, unknown>>(
    `select * from market_snapshots where mint_address = $1 and source = 'aggregate' order by captured_at desc limit 1`,
    [mint],
  );
  if (last && !opts.force && Date.now() - Date.parse(String(last.captured_at)) < ttl) return snapshotToMarket(last, false);

  const sources: string[] = [];
  let onchain: Awaited<ReturnType<typeof fetchOnchainMarket>> | null = null;
  try {
    onchain = await withRpc((c) => fetchOnchainMarket(c, new PublicKey(mint)));
    sources.push("solana-rpc");
  } catch (e) {
    console.warn("[market] rpc failed", mint, e instanceof Error ? e.message : e);
  }
  const [usd, pool] = await Promise.all([solUsd(), gtTopPool(mint).catch(() => null)]);
  if (usd) sources.push("coingecko");
  if (pool) sources.push("geckoterminal");

  if (!onchain && !pool) {
    if (last) return snapshotToMarket(last, true);
    return {
      mint,
      lifecycle: "unknown",
      priceSol: null,
      priceUsd: null,
      marketCapSol: null,
      marketCapUsd: null,
      volume24hUsd: null,
      liquidityUsd: null,
      curveProgress: null,
      solUsd: usd,
      pool: null,
      sources,
      capturedAt: new Date().toISOString(),
      stale: true,
    };
  }

  const market: MarketData = {
    mint,
    lifecycle: onchain?.lifecycle ?? "unknown",
    priceSol: onchain?.priceSol ?? null,
    priceUsd: onchain?.priceSol != null && usd ? onchain.priceSol * usd : null,
    marketCapSol: onchain?.marketCapSol ?? null,
    marketCapUsd: onchain?.marketCapSol != null && usd ? onchain.marketCapSol * usd : null,
    volume24hUsd: pool ? n(pool.attributes.volume_usd?.h24) : null,
    liquidityUsd: pool ? n(pool.attributes.reserve_in_usd) : onchain?.liquiditySol != null && usd ? onchain.liquiditySol * usd : null,
    curveProgress: onchain?.curveProgress ?? null,
    solUsd: usd,
    pool: pool?.attributes.address ?? onchain?.pool ?? null,
    sources,
    capturedAt: new Date().toISOString(),
    stale: false,
  };
  await q(
    `insert into market_snapshots (mint_address, source, price_sol, price_usd, market_cap_sol, market_cap_usd, volume_24h_usd,
       liquidity_usd, curve_progress, lifecycle, raw)
     values ($1, 'aggregate', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      mint,
      market.priceSol,
      market.priceUsd,
      market.marketCapSol,
      market.marketCapUsd,
      market.volume24hUsd,
      market.liquidityUsd,
      market.curveProgress,
      market.lifecycle,
      JSON.stringify({ sources, pool: market.pool, solUsd: usd }),
    ],
  );
  // Keep the cache table bounded per mint.
  await q(
    `delete from market_snapshots where mint_address = $1 and captured_at < now() - interval '7 days'`,
    [mint],
  );
  return market;
}

function snapshotToMarket(r: Record<string, unknown>, stale: boolean): MarketData {
  const raw = (typeof r.raw === "string" ? JSON.parse(r.raw) : r.raw) as { sources?: string[]; pool?: string; solUsd?: number } | null;
  return {
    mint: r.mint_address as string,
    lifecycle: (r.lifecycle as MarketData["lifecycle"]) ?? "unknown",
    priceSol: n(r.price_sol),
    priceUsd: n(r.price_usd),
    marketCapSol: n(r.market_cap_sol),
    marketCapUsd: n(r.market_cap_usd),
    volume24hUsd: n(r.volume_24h_usd),
    liquidityUsd: n(r.liquidity_usd),
    curveProgress: n(r.curve_progress),
    solUsd: raw?.solUsd ?? null,
    pool: raw?.pool ?? null,
    sources: raw?.sources ?? [],
    capturedAt: new Date(String(r.captured_at)).toISOString(),
    stale,
  };
}

export async function getCandles(mint: string, timeframe: "minute" | "hour" | "day", aggregate: number): Promise<Candle[] | null> {
  try {
    const pool = await gtTopPool(mint);
    if (!pool) return null;
    return await cached(`gt-ohlcv:${pool.attributes.address}:${timeframe}:${aggregate}`, 30_000, async () => {
      const j = await getJson<{ data?: { attributes?: { ohlcv_list?: number[][] } } }>(
        `${env().GECKOTERMINAL_API_URL}/networks/solana/pools/${pool.attributes.address}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=300&currency=usd&token=base`,
      );
      const list = j.data?.attributes?.ohlcv_list ?? [];
      return list
        .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
        .sort((a, b) => a.time - b.time);
    });
  } catch {
    return null;
  }
}

export async function getRecentTrades(mint: string): Promise<MarketTrade[] | null> {
  try {
    const pool = await gtTopPool(mint);
    if (!pool) return null;
    return await cached(`gt-trades:${pool.attributes.address}`, 15_000, async () => {
      const j = await getJson<{ data?: Array<{ attributes: Record<string, string> }> }>(
        `${env().GECKOTERMINAL_API_URL}/networks/solana/pools/${pool.attributes.address}/trades`,
      );
      return (j.data ?? []).slice(0, 40).map((t) => {
        const a = t.attributes;
        const buy = a.kind === "buy";
        return {
          signature: a.tx_hash,
          side: buy ? "buy" : "sell",
          wallet: a.tx_from_address ?? null,
          tokenAmount: n(buy ? a.to_token_amount : a.from_token_amount),
          solAmount: n(buy ? a.from_token_amount : a.to_token_amount),
          usdValue: n(a.volume_in_usd),
          timestamp: a.block_timestamp,
          source: "geckoterminal",
        } satisfies MarketTrade;
      });
    });
  } catch {
    return null;
  }
}
