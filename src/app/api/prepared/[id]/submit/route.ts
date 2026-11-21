import { z } from "zod";
import { route, requireUser, parseJson, limit } from "@/lib/api";
import { submitPrepared } from "@/lib/fees/service";

const Body = z.object({ signedTransaction: z.string().min(100).max(4000) });

export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  limit(req, "prepared-submit", 30, 60_000, user.id);
  const { signedTransaction } = await parseJson(req, Body);
  return submitPrepared(user, id, signedTransaction);
});
