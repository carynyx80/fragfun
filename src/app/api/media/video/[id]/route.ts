import fs from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { q1 } from "@/lib/db";
import { localVideoPath } from "@/lib/video";
import { getSessionUser } from "@/lib/auth/session";

/** Development-only progressive video streaming with HTTP Range support (VIDEO_PROVIDER=local). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const clip = await q1<{ mime_type: string; is_draft: boolean; moderation_status: string; creator_id: string; video_provider: string }>(
    "select mime_type, is_draft, moderation_status, creator_id, video_provider from clips where id = $1",
    [id],
  );
  if (!clip || clip.video_provider !== "local" || env().VIDEO_PROVIDER !== "local") return new NextResponse(null, { status: 404 });
  if (clip.is_draft || clip.moderation_status !== "approved") {
    const u = await getSessionUser();
    if (!u || (u.id !== clip.creator_id && !u.isAdmin)) return new NextResponse(null, { status: 404 });
  }
  const file = localVideoPath(id);
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const range = req.headers.get("range");
  const headers: Record<string, string> = {
    "Content-Type": clip.mime_type || "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : Math.min(start + 2 * 1024 * 1024 - 1, size - 1);
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = fs.createReadStream(file, { start, end });
    return new NextResponse(stream as unknown as ReadableStream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(fs.createReadStream(file) as unknown as ReadableStream, {
    status: 200,
    headers: { ...headers, "Content-Length": String(size) },
  });
}
