import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export interface ProviderStatus {
  status: "awaiting_upload" | "uploading" | "processing" | "ready" | "failed";
  assetId?: string | null;
  playbackId?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  error?: string | null;
}

export interface CreatedUpload {
  uploadId: string;
  uploadUrl: string;
  method: "PUT";
}

async function mux() {
  const e = env();
  if (!e.MUX_TOKEN_ID || !e.MUX_TOKEN_SECRET) throw new Error("Mux credentials are not configured");
  const { default: Mux } = await import("@mux/mux-node");
  return new Mux({ tokenId: e.MUX_TOKEN_ID, tokenSecret: e.MUX_TOKEN_SECRET, webhookSecret: e.MUX_WEBHOOK_SECRET || undefined });
}

export function videoProvider(): "mux" | "local" {
  return env().VIDEO_PROVIDER;
}

export async function createUpload(clipId: string): Promise<CreatedUpload> {
  if (videoProvider() === "mux") {
    const m = await mux();
    const upload = await m.video.uploads.create({
      cors_origin: env().APP_URL,
      timeout: 3600,
      new_asset_settings: {
        playback_policies: ["public"],
        passthrough: clipId,
        video_quality: "basic",
        max_resolution_tier: "1080p",
      },
    });
    if (!upload.url) throw new Error("Mux did not return an upload URL");
    return { uploadId: upload.id, uploadUrl: upload.url, method: "PUT" };
  }
  return { uploadId: `local_${clipId}`, uploadUrl: `/api/uploads/local/${clipId}`, method: "PUT" };
}

export function muxThumbnail(playbackId: string) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1&width=720`;
}

/** Poll the provider for current processing state (used when webhooks are delayed or unreachable). */
export async function fetchProviderStatus(clip: {
  id: string;
  video_provider: string;
  video_upload_id: string | null;
  video_asset_id: string | null;
  processing_status: string;
}): Promise<ProviderStatus | null> {
  if (clip.video_provider !== "mux") return null;
  const m = await mux();
  let assetId = clip.video_asset_id;
  if (!assetId && clip.video_upload_id) {
    const up = await m.video.uploads.retrieve(clip.video_upload_id);
    if (up.status === "errored" || up.status === "cancelled" || up.status === "timed_out")
      return { status: "failed", error: up.error?.message ?? `Upload ${up.status}` };
    if (!up.asset_id) return { status: up.status === "waiting" ? "awaiting_upload" : "uploading" };
    assetId = up.asset_id;
  }
  if (!assetId) return null;
  const asset = await m.video.assets.retrieve(assetId);
  return assetToStatus(asset);
}

export function assetToStatus(asset: {
  id: string;
  status: string;
  duration?: number;
  playback_ids?: Array<{ id: string; policy: string }>;
  errors?: { messages?: string[] };
}): ProviderStatus {
  const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null;
  if (asset.status === "ready" && playbackId)
    return {
      status: "ready",
      assetId: asset.id,
      playbackId,
      thumbnailUrl: muxThumbnail(playbackId),
      durationSeconds: asset.duration ?? null,
    };
  if (asset.status === "errored")
    return { status: "failed", assetId: asset.id, error: asset.errors?.messages?.join("; ") ?? "Video processing failed" };
  return { status: "processing", assetId: asset.id };
}

export async function unwrapMuxWebhook(body: string, headers: Headers) {
  const m = await mux();
  return m.webhooks.unwrap(body, headers);
}

export async function deleteProviderAsset(clip: { video_provider: string; video_asset_id: string | null; id: string }) {
  if (clip.video_provider === "mux" && clip.video_asset_id) {
    const m = await mux();
    await m.video.assets.delete(clip.video_asset_id).catch(() => undefined);
  } else if (clip.video_provider === "local") {
    await fs.rm(localVideoPath(clip.id), { force: true });
  }
}

export function localVideoPath(clipId: string) {
  if (!/^[0-9a-f-]{36}$/.test(clipId)) throw new Error("bad clip id");
  return path.resolve(env().LOCAL_DATA_DIR, "videos", `${clipId}.bin`);
}

/** Public playback source for a clip. HLS for Mux, progressive file for local development. */
export function playbackSource(clip: { video_provider: string; playback_id: string | null; id: string; mime_type?: string | null }) {
  if (clip.video_provider === "mux" && clip.playback_id)
    return { type: "hls" as const, src: `https://stream.mux.com/${clip.playback_id}.m3u8` };
  if (clip.video_provider === "local") return { type: "file" as const, src: `/api/media/video/${clip.id}`, mime: clip.mime_type ?? "video/mp4" };
  return null;
}
