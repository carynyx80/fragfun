import { route, parseJson, requireUser, limit } from "@/lib/api";
import { q } from "@/lib/db";
import { reportSchema } from "@/lib/validation";

/** Report content (including copyright takedown requests). Reviewed in /admin. */
export const POST = route(async (req) => {
  const user = await requireUser();
  limit(req, "report", 20, 60 * 60_000, user.id);
  const b = await parseJson(req, reportSchema);
  await q(
    `insert into reports (reporter_id, target_type, target_id, reason, details) values ($1, $2, $3, $4, $5)
     on conflict (reporter_id, target_type, target_id) do update set reason = excluded.reason, details = excluded.details`,
    [user.id, b.targetType, b.targetId, b.reason, b.details ?? null],
  );
  return { ok: true };
});
