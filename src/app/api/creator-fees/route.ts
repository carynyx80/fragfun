import { route, requireUser, limit } from "@/lib/api";
import { creatorFeesForUser } from "@/lib/fees/service";

/** The signed-in creator's tokens with fee-split status and claimable creator fees (on-chain). */
export const GET = route(async (req) => {
  const user = await requireUser();
  limit(req, "creator-fees", 30, 60_000, user.id);
  return creatorFeesForUser(user);
});
