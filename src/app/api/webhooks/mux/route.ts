import { NextResponse, type NextRequest } from "next/server";
import { q, q1 } from "@/lib/db";
import { assetToStatus, unwrapMuxWebhook } from "@/lib/video";
import { logEvent, notify } from "@/lib/log";

/**
 * Mux webhook. The signature is verified with MUX_WEBHOOK_SECRET; unsigned or forged requests are rejected.
 * Handling is idempotent: replays only re-apply the same terminal state.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  let event: { type: string; data: Record<string, unknown> };
  try {
    event = (await unwrapMuxWebhook(body, req.headers)) as unknown as typeof event;
  } catch (e) {
    await logEvent("warn", "webhook:mux", "Rejected webhook", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  const data = event.data as {
    id: string;
    status: string;
    passthrough?: string;
    upload_id?: string;
    duration?: number;
    playback_ids?: Array<{ id: string; policy: string }>;
    errors?: { messages?: string[] };
  };
  if (!event.type.startsWith("video.asset.")) return NextResponse.json({ ok: true, ignored: event.type });
  const clipId = data.passthrough;
  const clip = clipId && /^[0-9a-f-]{36}$/.test(clipId)
    ? await q1<{ id: string; creator_id: string; processing_status: string }>("select id, creator_id, processing_status from clips where id = $1", [clipId])
    : data.upload_id
      ? await q1<{ id: string; creator_id: string; processing_status: string }>("select id, creator_id, processing_status from clips where video_upload_id = $1", [data.upload_id])
      : null;
  if (!clip) return NextResponse.json({ ok: true, ignored: "unknown clip" });

  if (event.type === "video.asset.deleted") return NextResponse.json({ ok: true });
  const s = assetToStatus(data);
  if (event.type === "video.asset.created" && s.status === "processing") {
    await q("update clips set processing_status = 'processing', video_asset_id = $2, updated_at = now() where id = $1 and processing_status in ('uploading','awaiting_upload')", [clip.id, data.id]);
  } else if (s.status === "ready") {
    await q(
      `update clips set processing_status = 'ready', video_asset_id = $2, playback_id = $3, thumbnail_url = coalesce(thumbnail_url, $4),
         duration_seconds = $5, processing_error = null, updated_at = now() where id = $1`,
      [clip.id, data.id, s.playbackId, s.thumbnailUrl, s.durationSeconds ?? null],
    );
    await notify(clip.creator_id, "upload_ready", "Your clip is ready", "Add details and launch a token.", `/create?clip=${clip.id}`, `upload-ready:${clip.id}`);
  } else if (s.status === "failed") {
    await q("update clips set processing_status = 'failed', processing_error = $2, updated_at = now() where id = $1", [clip.id, s.error]);
    await notify(clip.creator_id, "upload_failed", "Video processing failed", s.error ?? null, `/create`, `upload-failed:${clip.id}`);
    await logEvent("warn", "video", "Processing failed", { clip: clip.id, error: s.error });
  }
  return NextResponse.json({ ok: true });
}
