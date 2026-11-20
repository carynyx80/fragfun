import { z } from "zod";
import { route, limit } from "@/lib/api";
import { getCandles } from "@/lib/market";

const Query = z.object({
  tf: z.enum(["5m", "15m", "1h", "4h", "1d"]).default("5m"),
});
const MAP = { "5m": ["minute", 5], "15m": ["minute", 15], "1h": ["hour", 1], "4h": ["hour", 4], "1d": ["day", 1] } as const;

export const GET = route<{ mint: string }>(async (req, { params }) => {
  const { mint } = await params;
  limit(req, "candles", 60, 60_000);
  const { tf } = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
  const [timeframe, agg] = MAP[tf];
  const candles = await getCandles(mint, timeframe, agg);
  return { candles, source: candles ? "geckoterminal" : null };
});
