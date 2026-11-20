import "server-only";
import { q, q1 } from "@/lib/db";
import { tokenTrendingScore } from "@/lib/trending";

export async function getTokenByMint(mint: string) {
  return q1<Record<string, unknown>>(
    `select t.*, u.wallet_address as creator_wallet, p.username as creator_username, p.display_name as creator_display_name,
            p.avatar_url as creator_avatar, c.title as clip_title, c.thumbnail_url as clip_thumbnail, c.moderation_status as clip_moderation
       from tokens t join users u on u.id = t.creator_id left join creator_profiles p on p.user_id = u.id
       join clips c on c.id = t.clip_id
      where t.mint_address = $1 and t.launch_status = 'confirmed'`,
    [mint],
  );
}

export async function listTokens(kind: "recent" | "hot", limit = 12) {
  const rows = await q<Record<string, unknown>>(
    `select t.mint_address, t.name, t.symbol, t.image_url, t.clip_id, t.confirmed_at, u.wallet_address as creator_wallet,
            p.username as creator_username, ms.market_cap_usd, ms.market_cap_sol, ms.volume_24h_usd, ms.lifecycle, ms.curve_progress,
            (select count(distinct ti.user_id) from trade_intents ti where ti.token_id = t.id and ti.status = 'confirmed'
               and ti.created_at > now() - interval '24 hours')::int as traders_24h
       from tokens t join users u on u.id = t.creator_id left join creator_profiles p on p.user_id = u.id
       join clips c on c.id = t.clip_id
       left join lateral (select * from market_snapshots s where s.mint_address = t.mint_address order by captured_at desc limit 1) ms on true
      where t.launch_status = 'confirmed' and c.moderation_status = 'approved' and u.status = 'active'
      order by t.confirmed_at desc limit 200`,
  );
  const now = Date.now();
  const mapped = rows.map((r) => ({
    mint: r.mint_address as string,
    name: r.name as string,
    symbol: r.symbol as string,
    imageUrl: r.image_url as string,
    clipId: r.clip_id as string,
    confirmedAt: new Date(String(r.confirmed_at)).toISOString(),
    creator: { wallet: r.creator_wallet as string, username: (r.creator_username as string) ?? null },
    marketCapUsd: r.market_cap_usd != null ? Number(r.market_cap_usd) : null,
    marketCapSol: r.market_cap_sol != null ? Number(r.market_cap_sol) : null,
    volume24hUsd: r.volume_24h_usd != null ? Number(r.volume_24h_usd) : null,
    lifecycle: (r.lifecycle as string) ?? null,
    curveProgress: r.curve_progress != null ? Number(r.curve_progress) : null,
    traders24h: Number(r.traders_24h ?? 0),
  }));
  if (kind === "recent") return mapped.slice(0, limit);
  return mapped
    .map((t) => ({
      ...t,
      score: tokenTrendingScore({
        volume24hUsd: t.volume24hUsd,
        fragfunTraders24h: t.traders24h,
        ageHours: (now - Date.parse(t.confirmedAt)) / 3_600_000,
      }),
    }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
