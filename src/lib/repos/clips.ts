import "server-only";
import { q, q1 } from "@/lib/db";
import { playbackSource } from "@/lib/video";
import { clipTrendingScore } from "@/lib/trending";
import type { ClipCardData } from "@/lib/types";

const CLIP_SELECT = `
  select c.id, c.title, c.description, c.thumbnail_url, c.view_count, c.like_count, c.published_at, c.created_at,
         c.video_provider, c.playback_id, c.mime_type, c.duration_seconds, c.processing_status, c.moderation_status, c.is_draft,
         cat.slug as category_slug, cat.name as category_name,
         u.wallet_address as creator_wallet, p.username as creator_username, p.display_name as creator_display_name,
         p.avatar_url as creator_avatar,
         t.mint_address as token_mint, t.symbol as token_symbol, t.name as token_name, t.image_url as token_image,
         t.launch_status as token_status, t.confirmed_at as token_confirmed_at,
         ms.market_cap_usd, ms.market_cap_sol, ms.volume_24h_usd, ms.lifecycle as market_lifecycle, ms.captured_at as market_captured_at
    from clips c
    join users u on u.id = c.creator_id
    left join creator_profiles p on p.user_id = u.id
    left join categories cat on cat.id = c.category_id
    left join lateral (
      select * from tokens t where t.clip_id = c.id and t.launch_status = 'confirmed' limit 1
    ) t on true
    left join lateral (
      select * from market_snapshots s where s.mint_address = t.mint_address order by s.captured_at desc limit 1
    ) ms on true`;

const PUBLIC = `c.is_draft = false and c.moderation_status = 'approved' and c.processing_status = 'ready' and u.status = 'active'`;

type Raw = Record<string, unknown>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toClipCard(r: Raw): ClipCardData {
  return {
    id: r.id as string,
    title: (r.title as string) || "Untitled clip",
    description: (r.description as string) ?? "",
    thumbnailUrl: (r.thumbnail_url as string) ?? null,
    viewCount: Number(r.view_count ?? 0),
    likeCount: Number(r.like_count ?? 0),
    publishedAt: r.published_at ? new Date(r.published_at as string).toISOString() : null,
    durationSeconds: num(r.duration_seconds),
    category: r.category_slug ? { slug: r.category_slug as string, name: r.category_name as string } : null,
    playback: playbackSource({
      id: r.id as string,
      video_provider: r.video_provider as string,
      playback_id: (r.playback_id as string) ?? null,
      mime_type: (r.mime_type as string) ?? null,
    }),
    creator: {
      wallet: r.creator_wallet as string,
      username: (r.creator_username as string) ?? null,
      displayName: (r.creator_display_name as string) ?? null,
      avatarUrl: (r.creator_avatar as string) ?? null,
    },
    token: r.token_mint
      ? {
          mint: r.token_mint as string,
          symbol: r.token_symbol as string,
          name: r.token_name as string,
          imageUrl: r.token_image as string,
          status: r.token_status as string,
          confirmedAt: r.token_confirmed_at ? new Date(r.token_confirmed_at as string).toISOString() : null,
        }
      : null,
    market: r.market_captured_at
      ? {
          marketCapUsd: num(r.market_cap_usd),
          marketCapSol: num(r.market_cap_sol),
          volume24hUsd: num(r.volume_24h_usd),
          lifecycle: (r.market_lifecycle as string) ?? null,
          capturedAt: new Date(r.market_captured_at as string).toISOString(),
        }
      : null,
  };
}

export async function listClips(opts: {
  sort: "new" | "views" | "launched";
  category?: string;
  creatorWallet?: string;
  limit: number;
  offset: number;
}) {
  const params: unknown[] = [];
  const where = [PUBLIC];
  if (opts.category) {
    params.push(opts.category);
    where.push(`cat.slug = $${params.length}`);
  }
  if (opts.creatorWallet) {
    params.push(opts.creatorWallet);
    where.push(`u.wallet_address = $${params.length}`);
  }
  if (opts.sort === "launched") where.push("t.mint_address is not null");
  const order =
    opts.sort === "views"
      ? "c.view_count desc, c.published_at desc"
      : opts.sort === "launched"
        ? "t.confirmed_at desc"
        : "c.published_at desc";
  params.push(opts.limit + 1, opts.offset);
  const rows = await q<Raw>(
    `${CLIP_SELECT} where ${where.join(" and ")} order by ${order}, c.id limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const items = rows.slice(0, opts.limit).map(toClipCard);
  return { items, nextOffset: rows.length > opts.limit ? opts.offset + opts.limit : null };
}

export async function trendingClips(limit = 12) {
  const rows = await q<Raw & { views_24h: number; likes_24h: number; shares_24h: number; votes_24h: number }>(
    `${CLIP_SELECT.replace(
      "select c.id,",
      `select
        (select count(*) from clip_engagement e where e.clip_id = c.id and e.engagement_type = 'view' and e.created_at > now() - interval '24 hours')::int as views_24h,
        (select count(*) from clip_engagement e where e.clip_id = c.id and e.engagement_type = 'like' and e.created_at > now() - interval '24 hours')::int as likes_24h,
        (select count(*) from clip_engagement e where e.clip_id = c.id and e.engagement_type = 'share' and e.created_at > now() - interval '24 hours')::int as shares_24h,
        (select count(*) from clip_war_votes v where v.clip_id = c.id and v.created_at > now() - interval '24 hours')::int as votes_24h,
        c.id,`,
    )}
     where ${PUBLIC} and c.published_at > now() - interval '30 days'
     order by c.published_at desc limit 300`,
  );
  const now = Date.now();
  return rows
    .map((r) => {
      const card = toClipCard(r);
      const ageHours = card.publishedAt ? (now - Date.parse(card.publishedAt)) / 3_600_000 : 9999;
      const score = clipTrendingScore({
        views24h: Number(r.views_24h),
        likes24h: Number(r.likes_24h),
        shares24h: Number(r.shares_24h),
        warVotes24h: Number(r.votes_24h),
        volume24hUsd: card.market?.volume24hUsd ?? null,
        ageHours,
      });
      return { card, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ ...x.card, trendingScore: Number(x.score.toFixed(4)) }));
}

export async function getClip(id: string, viewerId?: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await q1<Raw & { creator_id: string }>(
    `${CLIP_SELECT.replace("select c.id,", "select c.creator_id, c.content_hash, c.processing_error, c.id,")} where c.id = $1`,
    [id],
  );
  if (!r) return null;
  const isOwner = Boolean(viewerId && viewerId === r.creator_id);
  const isPublic = !r.is_draft && r.moderation_status === "approved" && r.processing_status === "ready";
  return {
    ...toClipCard(r),
    isOwner,
    isPublic,
    isDraft: Boolean(r.is_draft),
    processingStatus: r.processing_status as string,
    processingError: (r.processing_error as string) ?? null,
    moderationStatus: r.moderation_status as string,
  };
}

export async function relatedClips(clipId: string, categorySlug: string | null, limit = 6) {
  const rows = await q<Raw>(
    `${CLIP_SELECT} where ${PUBLIC} and c.id <> $1 ${categorySlug ? "and cat.slug = $3" : ""}
     order by c.published_at desc limit $2`,
    categorySlug ? [clipId, limit, categorySlug] : [clipId, limit],
  );
  return rows.map(toClipCard);
}

export async function clipsByCreator(userId: string, includePrivate: boolean) {
  const rows = await q<Raw>(
    `${CLIP_SELECT.replace("select c.id,", "select c.processing_error, c.id,")} where c.creator_id = $1 ${includePrivate ? "" : `and ${PUBLIC}`}
     order by c.created_at desc limit 100`,
    [userId],
  );
  return rows.map((r) => ({
    ...toClipCard(r),
    isDraft: Boolean(r.is_draft),
    processingStatus: r.processing_status as string,
    processingError: (r.processing_error as string) ?? null,
    moderationStatus: r.moderation_status as string,
  }));
}

export async function searchAll(term: string, offset: number) {
  const like = `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const [clips, tokens, creators] = await Promise.all([
    q<Raw>(`${CLIP_SELECT} where ${PUBLIC} and c.title ilike $1 order by c.view_count desc limit 20 offset $2`, [like, offset]),
    q<Raw>(
      `select t.mint_address, t.name, t.symbol, t.image_url, t.clip_id from tokens t
        join clips c on c.id = t.clip_id
        where t.launch_status = 'confirmed' and c.moderation_status = 'approved'
          and (t.name ilike $1 or t.symbol ilike $1 or t.mint_address = $2)
        order by t.confirmed_at desc limit 20 offset $3`,
      [like, term, offset],
    ),
    q<Raw>(
      `select u.wallet_address, p.username, p.display_name, p.avatar_url from users u
        left join creator_profiles p on p.user_id = u.id
        where u.status = 'active' and (p.username ilike $1 or p.display_name ilike $1 or u.wallet_address = $2)
        order by u.created_at desc limit 20 offset $3`,
      [like, term, offset],
    ),
  ]);
  return {
    clips: clips.map(toClipCard),
    tokens: tokens.map((t) => ({
      mint: t.mint_address as string,
      name: t.name as string,
      symbol: t.symbol as string,
      imageUrl: t.image_url as string,
      clipId: t.clip_id as string,
    })),
    creators: creators.map((c) => ({
      wallet: c.wallet_address as string,
      username: (c.username as string) ?? null,
      displayName: (c.display_name as string) ?? null,
      avatarUrl: (c.avatar_url as string) ?? null,
    })),
  };
}
