import { route, parseJson, requireUser, limit } from "@/lib/api";
import { tradeQuoteSchema } from "@/lib/validation";
import { prepareTrade } from "@/lib/trade/service";

/** Fresh executable quote + unsigned transaction for the signed-in wallet. */
export const POST = route(async (req) => {
  const user = await requireUser();
  limit(req, "trade-quote", 30, 60_000, user.id);
  return prepareTrade(user, await parseJson(req, tradeQuoteSchema));
});
