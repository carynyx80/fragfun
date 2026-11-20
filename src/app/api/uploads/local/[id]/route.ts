import fs from "node:fs/promises";
import path from "node:path";
import { route, requireUser, err } from "@/lib/api";
import { env } from "@/lib/env";
import { q, q1 } from "@/lib/db";
import { localVideoPath } from "@/lib/video";
import { sniffVideo } from "@/lib/storage";
import { createHash } from "node:crypto";
import { notify } from "@/lib/log";

/**
 * Development-only video receiver (VIDEO_PROVIDER=local). Production uses Mux direct uploads.
 * Verifies ownership, size, container magic bytes and the SHA-256 declared at upload creation.
 */
export const PUT = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  if (env().VIDEO_PROVIDER !== "local") throw err.notFound();
  const user = await requireUser();
  const clip = await q1<{ id: string; processing_status: string; content_hash: string; file_size_bytes: string; mime_type: string }>(
    "select id, processing_status, content_hash, file_size_bytes, mime_type from clips where id = $1 and creator_id = $2",
    [id, user.id],
  );
  if (!clip) throw err.notFound("Upload not found.");
  if (clip.processing_status !== "uploading") throw err.conflict("This upload is no longer accepting data.");
  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.length > env().VIDEO_MAX_BYTES || buf.length !== Number(clip.file_size_bytes))
    throw err.badRequest("Uploaded file size does not match.");
  const kind = sniffVideo(buf);
  const fail = async (msg: string) => {
    await q("update clips set processing_status = 'failed', processing_error = $2, updated_at = now() where id = $1", [id, msg]);
    await notify(user.id, "upload_failed", "Video processing failed", msg, `/create`, `upload-failed:${id}`);
    throw err.badRequest(msg, "processing_failed");
  };
  if (!kind) await fail("This file is not a supported MP4, MOV or WebM video.");
  const hash = createHash("sha256").update(buf).digest("hex");
  if (hash !== clip.content_hash) await fail("The uploaded file does not match the selected file.");
  const file = localVideoPath(id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
  await q(
    "update clips set processing_status = 'ready', mime_type = $2, video_asset_id = $3, updated_at = now() where id = $1",
    [id, kind, `local_${id}`],
  );
  await notify(user.id, "upload_ready", "Your clip is ready", "Add details and launch a token.", `/create?clip=${id}`, `upload-ready:${id}`);
  return { ok: true, status: "ready" };
});
