import { route, requireUser, limit } from "@/lib/api";
import { tradeStatus } from "@/lib/trade/service";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  limit(req, "trade-status", 90, 60_000, user.id);
  return tradeStatus(user.id, id);
});
