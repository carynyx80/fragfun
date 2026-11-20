import { route, requireUser, limit } from "@/lib/api";
import { getAttempt, reconcileAttempt } from "@/lib/launch/service";

/** Current launch status. Reconciles against the chain on every call (rate limited). */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  limit(req, "launch-status", 60, 60_000, user.id);
  return reconcileAttempt(await getAttempt(user.id, id));
});
