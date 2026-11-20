import { route, limit } from "@/lib/api";
import { q } from "@/lib/db";

/** Verified activity only: confirmed launches and confirmed trades executed through Fragfun. */
export const GET = route(async (req) => {
  limit(req, "activity", 60, 60_000);
  const items = await q<Record<string, unknown>>(
    `select * from (
       select 'launch' as kind, t.confirmed_at as at, t.launch_signature as signature, t.symbol, t.name, t.mint_address, t.image_url,
              t.clip_id, u.wallet_address, p.username, null::text as side, null::numeric as sol_delta
         from tokens t join users u on u.id = t.creator_id left join creator_profiles p on p.user_id = u.id
         join clips c on c.id = t.clip_id
        where t.launch_status = 'confirmed' and c.moderation_status = 'approved'
       union all
       select 'trade', ti.updated_at, ti.transaction_signature, t.symbol, t.name, t.mint_address, t.image_url, t.clip_id,
              u.wallet_address, p.username, ti.side, ti.sol_delta_lamports
         from trade_intents ti join tokens t on t.id = ti.token_id join users u on u.id = ti.user_id
         left join creator_profiles p on p.user_id = u.id
        where ti.status = 'confirmed'
     ) a order by at desc limit 60`,
  );
  return { items };
});
