import { route, requireUser, parseJson, err, limit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { q, q1 } from "@/lib/db";
import { getClip, relatedClips } from "@/lib/repos/clips";
import { clipDetailsSchema } from "@/lib/validation";
import { deleteProviderAsset } from "@/lib/video";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  limit(req, "clip-get", 240, 60_000);
  const viewer = await getSessionUser();
  const clip = await getClip(id, viewer?.id);
  if (!clip || (!clip.isPublic && !clip.isOwner && !viewer?.isAdmin)) throw err.notFound("Clip not found.");
  const liked = viewer
    ? Boolean(await q1("select 1 from clip_engagement where clip_id = $1 and visitor_key = $2 and engagement_type = 'like'", [id, `u:${viewer.id}`]))
    : false;
  return { clip, liked, related: await relatedClips(id, clip.category?.slug ?? null) };
});

/** Update title/description/category and optionally publish. */
export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const body = await parseJson(req, clipDetailsSchema);
  const clip = await q1<{ processing_status: string; is_draft: boolean }>(
    "select processing_status, is_draft from clips where id = $1 and creator_id = $2",
    [id, user.id],
  );
  if (!clip) throw err.notFound("Clip not found.");
  const cat = await q1<{ id: string }>("select id from categories where slug = $1 and is_active", [body.categorySlug]);
  if (!cat) throw err.badRequest("Choose a valid category.");
  if (body.publish && clip.processing_status !== "ready") throw err.conflict("Your clip can be published once processing finishes.");
  await q(
    `update clips set title = $2, description = $3, category_id = $4,
       is_draft = case when $5 then false else is_draft end,
       published_at = case when $5 and published_at is null then now() else published_at end,
       updated_at = now()
     where id = $1`,
    [id, body.title, body.description, cat.id, body.publish],
  );
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const clip = await q1<{ id: string; video_provider: string; video_asset_id: string | null }>(
    "select id, video_provider, video_asset_id from clips where id = $1 and creator_id = $2",
    [id, user.id],
  );
  if (!clip) throw err.notFound("Clip not found.");
  const token = await q1("select 1 from tokens where clip_id = $1 and launch_status <> 'failed'", [id]);
  if (token) throw err.conflict("Clips with a launched token cannot be deleted. You can report or hide it instead.");
  await q("delete from tokens where clip_id = $1 and launch_status = 'failed'", [id]);
  await q("delete from clips where id = $1", [id]);
  await deleteProviderAsset(clip);
  return { ok: true };
});
