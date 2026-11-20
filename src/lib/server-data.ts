import "server-only";

/**
 * Data for server-rendered page shells (metadata, not-found handling).
 * - Single deployment: read the database directly.
 * - Split deployment (BACKEND_URL set, e.g. frontend on Vercel): fetch the backend's public API,
 *   because the frontend has no database access.
 */
const backend = () => process.env.BACKEND_URL?.replace(/\/$/, "") || null;

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${backend()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface PublicClipMeta {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  token: { name: string; symbol: string; imageUrl: string } | null;
}

export async function getPublicClipMeta(id: string): Promise<PublicClipMeta | null> {
  if (backend()) {
    const r = await fetchJson<{ clip: PublicClipMeta & { isPublic: boolean } }>(`/api/clips/${encodeURIComponent(id)}`);
    return r?.clip?.isPublic ? r.clip : null;
  }
  const { getClip } = await import("@/lib/repos/clips");
  const c = await getClip(id).catch(() => null);
  return c && c.isPublic ? c : null;
}

export interface PublicTokenMeta {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string;
  clipId: string;
  clipTitle: string;
}

export async function getPublicTokenMeta(mint: string): Promise<PublicTokenMeta | null> {
  if (backend()) {
    const r = await fetchJson<{ token: PublicTokenMeta }>(`/api/tokens/${encodeURIComponent(mint)}`);
    return r?.token ?? null;
  }
  const { getTokenByMint } = await import("@/lib/repos/tokens");
  const t = await getTokenByMint(mint).catch(() => null);
  if (!t || t.clip_moderation === "removed") return null;
  return {
    mint: String(t.mint_address),
    name: String(t.name),
    symbol: String(t.symbol),
    imageUrl: String(t.image_url),
    clipId: String(t.clip_id),
    clipTitle: String(t.clip_title),
  };
}
