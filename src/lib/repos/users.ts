import "server-only";
import { q, q1 } from "@/lib/db";
import { creatorScore } from "@/lib/trending";

export async function getProfileByWallet(wallet: string) {
  const r = await q1<Record<string, unknown>>(
    `select u.id, u.wallet_address, u.created_at, u.status, p.username, p.display_name, p.avatar_url, p.bio, p.twitter,
       (select count(*) from clips c where c.creator_id = u.id and c.is_draft = false and c.moderation_status = 'approved' and c.processing_status = 'ready')::int as clip_count,
       (select coalesce(sum(view_count),0) from clips c where c.creator_id = u.id and c.is_draft = false and c.moderation_status = 'approved')::bigint as total_views,
       (select coalesce(sum(like_count),0) from clips c where c.creator_id = u.id and c.is_draft = false and c.moderation_status = 'approved')::bigint as total_likes,
       (select count(*) from tokens t where t.creator_id = u.id and t.launch_status = 'confirmed')::int as launch_count
     from users u left join creator_profiles p on p.user_id = u.id
     where u.wallet_address = $1 or lower(p.username) = lower($1)`,
    [wallet],
  );
  if (!r) return null;
  const launches = await q<Record<string, unknown>>(
    `select t.mint_address, t.name, t.symbol, t.image_url, t.clip_id, t.launch_signature, t.confirmed_at
       from tokens t where t.creator_id = $1 and t.launch_status = 'confirmed' order by t.confirmed_at desc limit 50`,
    [r.id],
  );
  return {
    id: r.id as string,
    wallet: r.wallet_address as string,
    status: r.status as string,
    joinedAt: new Date(String(r.created_at)).toISOString(),
    username: (r.username as string) ?? null,
    displayName: (r.display_name as string) ?? null,
    avatarUrl: (r.avatar_url as string) ?? null,
    bio: (r.bio as string) ?? null,
    twitter: (r.twitter as string) ?? null,
    stats: {
      clips: Number(r.clip_count),
      views: Number(r.total_views),
      likes: Number(r.total_likes),
      launches: Number(r.launch_count),
    },
    launches: launches.map((l) => ({
      mint: l.mint_address as string,
      name: l.name as string,
      symbol: l.symbol as string,
      imageUrl: l.image_url as string,
      clipId: l.clip_id as string,
      signature: l.launch_signature as string,
      confirmedAt: new Date(String(l.confirmed_at)).toISOString(),
    })),
  };
}

export async function creatorLeaderboard(limit = 25) {
  const rows = await q<Record<string, unknown>>(
    `select u.wallet_address, p.username, p.display_name, p.avatar_url,
       count(distinct c.id) filter (where c.is_draft = false and c.moderation_status = 'approved' and c.processing_status = 'ready')::int as clips,
       coalesce(sum(c.view_count) filter (where c.is_draft = false and c.moderation_status = 'approved'), 0)::bigint as views,
       coalesce(sum(c.like_count) filter (where c.is_draft = false and c.moderation_status = 'approved'), 0)::bigint as likes,
       (select count(*) from tokens t where t.creator_id = u.id and t.launch_status = 'confirmed')::int as launches
     from users u left join creator_profiles p on p.user_id = u.id left join clips c on c.creator_id = u.id
     where u.status = 'active'
     group by u.id, u.wallet_address, p.username, p.display_name, p.avatar_url
     having count(c.id) > 0`,
  );
  return rows
    .map((r) => {
      const s = { publishedClips: Number(r.clips), confirmedLaunches: Number(r.launches), totalViews: Number(r.views), totalLikes: Number(r.likes) };
      return {
        wallet: r.wallet_address as string,
        username: (r.username as string) ?? null,
        displayName: (r.display_name as string) ?? null,
        avatarUrl: (r.avatar_url as string) ?? null,
        ...s,
        score: Number(creatorScore(s).toFixed(2)),
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
