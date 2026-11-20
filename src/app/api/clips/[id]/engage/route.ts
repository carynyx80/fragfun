import { z } from "zod";
import { route, parseJson, limit, visitorKey, err } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { tx, q1 } from "@/lib/db";

const Body = z.object({ type: z.enum(["view", "like", "unlike", "share"]) });

/**
 * Engagement events. Deduplicated by unique constraint:
 * views once per visitor per hour, likes once per signed-in user, shares once per visitor per day.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const { type } = await parseJson(req, Body);
  limit(req, `engage-${type}`, type === "view" ? 120 : 30, 60_000);
  const clip = await q1("select 1 from clips where id = $1 and is_draft = false and moderation_status = 'approved'", [id]);
  if (!clip) throw err.notFound("Clip not found.");
  const user = await getSessionUser();
  if ((type === "like" || type === "unlike") && !user) throw err.unauthorized("Sign in to like clips.");
  const key = visitorKey(req, user?.id);
  const now = new Date().toISOString();
  const bucket = type === "view" ? now.slice(0, 13) : type === "share" ? now.slice(0, 10) : "once";

  return tx(async (db) => {
    if (type === "unlike") {
      const del = await db.query("delete from clip_engagement where clip_id = $1 and visitor_key = $2 and engagement_type = 'like' returning id", [id, key]);
      if (del.length) await db.query("update clips set like_count = greatest(0, like_count - 1) where id = $1", [id]);
      return { ok: true, counted: del.length > 0 };
    }
    const ins = await db.query(
      `insert into clip_engagement (clip_id, user_id, visitor_key, engagement_type, bucket) values ($1, $2, $3, $4, $5)
       on conflict do nothing returning id`,
      [id, user?.id ?? null, key, type, bucket],
    );
    if (ins.length && type === "view") await db.query("update clips set view_count = view_count + 1 where id = $1", [id]);
    if (ins.length && type === "like") await db.query("update clips set like_count = like_count + 1 where id = $1", [id]);
    return { ok: true, counted: ins.length > 0 };
  });
});
