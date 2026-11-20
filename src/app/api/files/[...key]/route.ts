import { NextResponse, type NextRequest } from "next/server";
import { contentTypeFor, readLocalPublicFile, safeKey } from "@/lib/storage";

/** Serves locally stored public files (development storage backend only). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  try {
    const k = safeKey(key.join("/"));
    const bytes = await readLocalPublicFile(k);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentTypeFor(k),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
