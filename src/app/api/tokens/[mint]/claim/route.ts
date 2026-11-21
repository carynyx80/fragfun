import { route, requireUser, limit } from "@/lib/api";
import { prepareClaim } from "@/lib/fees/service";

/** Prepare (unsigned) a creator-fee claim: distribute a split coin's fees, or collect the creator vault. */
export const POST = route<{ mint: string }>(async (req, { params }) => {
  const { mint } = await params;
  const user = await requireUser();
  limit(req, "fee-claim", 10, 60_000, user.id);
  return prepareClaim(user, mint);
});
