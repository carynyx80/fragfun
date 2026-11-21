import { z } from "zod";
import { route, parseJson, requireUser, limit } from "@/lib/api";
import { submitLaunch } from "@/lib/launch/service";

const Body = z.object({
  signedTransaction: z.string().min(100).max(4000),
  feeShare: z.object({ txId: z.string().uuid(), signedTransaction: z.string().min(100).max(4000) }).optional(),
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  limit(req, "launch-submit", 20, 60_000, user.id);
  const { signedTransaction, feeShare } = await parseJson(req, Body);
  return submitLaunch(user, id, signedTransaction, feeShare);
});
