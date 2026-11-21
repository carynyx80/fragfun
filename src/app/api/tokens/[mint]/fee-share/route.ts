import { route, requireUser, limit } from "@/lib/api";
import { prepareFeeShareForMint } from "@/lib/fees/service";

/** Prepare (unsigned) the creator-fee split transaction for a token whose split is not active yet. */
export const POST = route<{ mint: string }>(async (req, { params }) => {
  const { mint } = await params;
  const user = await requireUser();
  limit(req, "fee-share", 10, 60_000, user.id);
  return prepareFeeShareForMint(user, mint);
});
