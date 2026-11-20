"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client";
import type { Candle } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const TFS = ["5m", "15m", "1h", "4h", "1d"] as const;

/** OHLCV candles from GeckoTerminal. Shows an explicit unavailable state instead of fabricating data. */
export function PriceChart({ mint }: { mint: string }) {
  const [tf, setTf] = useState<(typeof TFS)[number]>("5m");
  const el = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ["candles", mint, tf],
    queryFn: () => api<{ candles: Candle[] | null; source: string | null }>(`/api/tokens/${mint}/candles?tf=${tf}`),
    refetchInterval: 30_000,
  });
  const candles = q.data?.candles;

  useEffect(() => {
    if (!el.current || !candles?.length) return;
    let disposed = false;
    let cleanup = () => {};
    void import("lightweight-charts").then(({ createChart, CandlestickSeries, HistogramSeries, ColorType }) => {
      if (disposed || !el.current) return;
      const chart = createChart(el.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#969696", fontFamily: "inherit" },
        grid: { vertLines: { color: "#1a1a1a" }, horzLines: { color: "#1a1a1a" } },
        rightPriceScale: { borderColor: "#262626" },
        timeScale: { borderColor: "#262626", timeVisible: true },
        crosshair: { mode: 0 },
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#8bff16",
        downColor: "#ff4d57",
        borderVisible: false,
        wickUpColor: "#8bff16",
        wickDownColor: "#ff4d57",
        priceFormat: { type: "price", precision: 10, minMove: 0.0000000001 },
      });
      series.setData(candles.map((c) => ({ time: c.time as never, open: c.open, high: c.high, low: c.low, close: c.close })));
      const vol = chart.addSeries(HistogramSeries, { priceScaleId: "", color: "#2a2a2a", priceFormat: { type: "volume" } });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      vol.setData(candles.map((c) => ({ time: c.time as never, value: c.volume, color: c.close >= c.open ? "#8bff1633" : "#ff4d5733" })));
      chart.timeScale().fitContent();
      cleanup = () => chart.remove();
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [candles]);

  return (
    <div className="rounded-2xl border border-ff-border bg-ff-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-ff-muted">Price (USD){q.data?.source ? " · GeckoTerminal" : ""}</span>
        <div className="flex gap-1">
          {TFS.map((t) => (
            <button key={t} type="button" onClick={() => setTf(t)} className={cn("rounded-md px-2 py-0.5 text-xs", t === tf ? "bg-[#222] text-white" : "text-ff-muted hover:text-white")}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64 bg-ff-bg2" />
      ) : !candles?.length ? (
        <div className="flex h-64 items-center justify-center rounded-xl bg-ff-bg2 px-6 text-center text-sm text-ff-muted">
          Chart data is not available yet. Market data providers usually index new tokens within a few minutes of their first trades.
        </div>
      ) : (
        <div ref={el} className="h-64 w-full" />
      )}
    </div>
  );
}
