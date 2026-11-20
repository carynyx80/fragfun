import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * Public file storage for images and self-hosted metadata.
 * - Supabase Storage (public bucket) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 * - Otherwise the local filesystem (.data/public), served by /api/files/[...key]. Development only.
 */
export function safeKey(key: string) {
  if (!/^[a-zA-Z0-9/_\-.]{1,200}$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key;
}

export async function putPublicFile(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  safeKey(key);
  const e = env();
  if (e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY) {
    const url = `${e.SUPABASE_URL}/storage/v1/object/${e.SUPABASE_STORAGE_BUCKET}/${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "false",
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: Buffer.from(bytes),
    });
    if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${await res.text()}`);
    return `${e.SUPABASE_URL}/storage/v1/object/public/${e.SUPABASE_STORAGE_BUCKET}/${key}`;
  }
  const file = path.resolve(e.LOCAL_DATA_DIR, "public", key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes);
  return `${e.APP_URL}/api/files/${key}`;
}

export async function readLocalPublicFile(key: string) {
  safeKey(key);
  const file = path.resolve(env().LOCAL_DATA_DIR, "public", key);
  return fs.readFile(file);
}

export function contentTypeFor(key: string) {
  const ext = key.split(".").pop()?.toLowerCase();
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      json: "application/json",
    } as Record<string, string>
  )[ext ?? ""] ?? "application/octet-stream";
}

/** Detect image type from magic bytes; never trust the client-declared type. */
export function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | "image/gif" | null {
  const b = bytes;
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP")
    return "image/webp";
  if (b.length > 6 && String.fromCharCode(...b.slice(0, 3)) === "GIF") return "image/gif";
  return null;
}

/** Detect video container from magic bytes. */
export function sniffVideo(bytes: Uint8Array): "video/mp4" | "video/quicktime" | "video/webm" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  if (String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return brand === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}
