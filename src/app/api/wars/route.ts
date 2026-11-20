import { z } from "zod";
import { route, parseJson, requireUser, limit, err } from "@/lib/api";
import { env } from "@/lib/env";
import { q, q1 } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { toClipCard } from "@/lib/repos/clips";

const Create = z.object({
  clipAId: z.string().uuid(),
  clipBId: z.string().uuid(),
  title: z.string().trim().max(80).optional(),
  durationHours: z.number().int().min(1).max(168).default(24),
});

async function warClip(id: string) {
  const { getClip } = await import("@/lib/repos/clips");
  return getClip(id);
}

/** Clip Wars: social head-to-head voting. No stakes, wagers or pooled funds. */
export const GET = route(async (req) => {
  limit(req, "wars-list", 60, 60_000);
  if (!env().FEATURE_CLIP_WARS) return { items: [], enabled: false };
  const viewer = await getSessionUser();
  await q("update clip_wars set status = 'ended' where status = 'active' and ends_at < now()");
  const wars = await q<Record<string, unknown>>(
    `select w.*, (select count(*) from clip_war_votes v where v.war_id = w.id and v.clip_id = w.clip_a_id)::int as votes_a,
            (select count(*) from clip_war_votes v where v.war_id = w.id and v.clip_id = w.clip_b_id)::int as votes_b,
            ${viewer ? `(select clip_id from clip_war_votes v where v.war_id = w.id and v.user_id = $1)` : "null"} as my_vote
       from clip_wars w where w.status in ('active', 'ended') order by (w.status = 'active') desc, w.created_at desc limit 20`,
    viewer ? [viewer.id] : [],
  );
  const items = [];
  for (const w of wars) {
    const [a, b] = await Promise.all([warClip(w.clip_a_id as string), warClip(w.clip_b_id as string)]);
    if (!a?.isPublic || !b?.isPublic) continue;
    items.push({
      id: w.id,
      title: w.title,
      status: w.status,
      endsAt: new Date(String(w.ends_at)).toISOString(),
      a: { clip: a, votes: Number(w.votes_a) },
      b: { clip: b, votes: Number(w.votes_b) },
      myVote: (w.my_vote as string) ?? null,
    });
  }
  return { items, enabled: true };
});

export const POST = route(async (req) => {
  if (!env().FEATURE_CLIP_WARS) throw err.unavailable("Clip Wars is disabled.");
  const user = await requireUser();
  limit(req, "wars-create", 5, 24 * 60 * 60_000, user.id);
  const b = await parseJson(req, Create);
  if (b.clipAId === b.clipBId) throw err.badRequest("Pick two different clips.");
  const both = await q(
    `select id from clips where id = any($1::uuid[]) and is_draft = false and moderation_status = 'approved' and processing_status = 'ready'`,
    [[b.clipAId, b.clipBId]],
  );
  if (both.length !== 2) throw err.badRequest("Both clips must be published.");
  const existing = await q1(
    `select 1 from clip_wars where status = 'active' and ((clip_a_id = $1 and clip_b_id = $2) or (clip_a_id = $2 and clip_b_id = $1))`,
    [b.clipAId, b.clipBId],
  );
  if (existing) throw err.conflict("These clips are already in an active war.");
  const rows = await q<{ id: string }>(
    `insert into clip_wars (clip_a_id, clip_b_id, created_by, title, ends_at) values ($1, $2, $3, $4, now() + ($5 || ' hours')::interval) returning id`,
    [b.clipAId, b.clipBId, user.id, b.title ?? null, String(b.durationHours)],
  );
  return { id: rows[0].id };
});
void toClipCard;
