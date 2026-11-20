import { route, parseJson, requireUser, limit, err } from "@/lib/api";
import { env } from "@/lib/env";
import { q, q1 } from "@/lib/db";
import { uploadRequestSchema } from "@/lib/validation";
import { createUpload, videoProvider } from "@/lib/video";

/** Step 1 of an upload: validate the file description, create a draft clip, return a one-time upload URL. */
export const POST = route(async (req) => {
  const user = await requireUser();
  limit(req, "upload-create", 10, 60 * 60_000, user.id);
  const body = await parseJson(req, uploadRequestSchema);
  const e = env();
  if (body.size > e.VIDEO_MAX_BYTES)
    throw err.badRequest(`Videos can be at most ${Math.round(e.VIDEO_MAX_BYTES / 1024 / 1024)} MB.`, "file_too_large");
  if (body.durationSeconds && body.durationSeconds > e.VIDEO_MAX_DURATION_SECONDS)
    throw err.badRequest(`Clips can be at most ${e.VIDEO_MAX_DURATION_SECONDS} seconds long.`, "too_long");

  // A previous attempt of the same file by the same creator that never finished is replaced (retry).
  await q(
    `delete from clips c where c.content_hash = $1 and c.creator_id = $2 and c.processing_status in ('failed', 'awaiting_upload', 'uploading')
       and not exists (select 1 from tokens t where t.clip_id = c.id)`,
    [body.contentHash, user.id],
  );
  const dup = await q1<{ id: string; creator_id: string }>(
    `select id, creator_id from clips where content_hash = $1 and moderation_status not in ('rejected', 'removed') and processing_status <> 'failed'`,
    [body.contentHash],
  );
  if (dup) {
    if (dup.creator_id === user.id) throw err.conflict("You already uploaded this clip.", "duplicate_own");
    throw err.conflict("This exact video has already been uploaded to Fragfun.", "duplicate");
  }
  const pending = await q<{ id: string }>(
    `select id from clips where creator_id = $1 and processing_status in ('awaiting_upload', 'uploading') and created_at > now() - interval '1 hour'`,
    [user.id],
  );
  if (pending.length >= 3) throw err.conflict("Finish your current uploads before starting another.", "too_many_pending");

  const provider = videoProvider();
  const rows = await q<{ id: string }>(
    `insert into clips (creator_id, video_provider, content_hash, file_size_bytes, mime_type, duration_seconds, rights_confirmed_at,
       moderation_status)
     values ($1, $2, $3, $4, $5, $6, now(), $7) returning id`,
    [user.id, provider, body.contentHash, body.size, body.mimeType, body.durationSeconds ?? null, e.AUTO_APPROVE_CLIPS ? "approved" : "pending"],
  );
  const clipId = rows[0].id;
  try {
    const up = await createUpload(clipId);
    await q("update clips set video_upload_id = $2, processing_status = 'uploading', updated_at = now() where id = $1", [clipId, up.uploadId]);
    return { clipId, uploadUrl: up.uploadUrl, method: up.method, provider };
  } catch (e2) {
    await q("delete from clips where id = $1", [clipId]);
    throw err.unavailable(
      `Video uploads are unavailable: ${e2 instanceof Error ? e2.message : "provider error"}`,
      "video_provider_unavailable",
    );
  }
});
