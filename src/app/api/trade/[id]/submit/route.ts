import { z } from "zod";
import { route, parseJson, requireUser, limit } from "@/lib/api";
import { submitTrade } from "@/lib/trade/service";

const Body = z.object({ signedTransaction: z.string().min(100).max(4000) });

export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  limit(req, "trade-submit", 30, 60_000, user.id);
  const { signedTransaction } = await parseJson(req, Body);
  return submitTrade(user, id, signedTransaction);
});
