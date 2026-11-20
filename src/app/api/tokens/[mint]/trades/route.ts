import { route, limit } from "@/lib/api";
import { getRecentTrades } from "@/lib/market";

export const GET = route<{ mint: string }>(async (req, { params }) => {
  const { mint } = await params;
  limit(req, "trades", 60, 60_000);
  const trades = await getRecentTrades(mint);
  return { trades, source: trades ? "geckoterminal" : null };
});
