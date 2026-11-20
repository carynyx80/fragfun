import { route, requireUser, err } from "@/lib/api";
import { q, q1 } from "@/lib/db";
import { fetchProviderStatus } from "@/lib/video";
import { notify } from "@/lib/log";

/** Processing status for the owner. Polls the provider if the webhook has not arrived yet. */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  const clip = await q1<{
    id: string;
    video_provider: string;
    video_upload_id: string | null;
    video_asset_id: string | null;
    processing_status: string;
    processing_error: string | null;
    thumbnail_url: string | null;
  }>("select id, video_provider, video_upload_id, video_asset_id, processing_status, processing_error, thumbnail_url from clips where id = $1 and creator_id = $2", [
    id,
    user.id,
  ]);
  if (!clip) throw err.notFound("Clip not found.");
  if (clip.processing_status === "uploading" || clip.processing_status === "processing") {
    const s = await fetchProviderStatus(clip).catch(() => null);
    if (s && s.status !== clip.processing_status) {
      await q(
        `update clips set processing_status = $2, video_asset_id = coalesce($3, video_asset_id), playback_id = coalesce($4, playback_id),
           thumbnail_url = coalesce(thumbnail_url, $5), duration_seconds = coalesce($6, duration_seconds), processing_error = $7, updated_at = now()
         where id = $1`,
        [id, s.status, s.assetId ?? null, s.playbackId ?? null, s.thumbnailUrl ?? null, s.durationSeconds ?? null, s.error ?? null],
      );
      if (s.status === "ready") await notify(user.id, "upload_ready", "Your clip is ready", null, `/create?clip=${id}`, `upload-ready:${id}`);
      if (s.status === "failed") await notify(user.id, "upload_failed", "Video processing failed", s.error ?? null, `/create`, `upload-failed:${id}`);
      return { status: s.status, error: s.error ?? null, thumbnailUrl: clip.thumbnail_url ?? s.thumbnailUrl ?? null };
    }
  }
  return { status: clip.processing_status, error: clip.processing_error, thumbnailUrl: clip.thumbnail_url };
});
