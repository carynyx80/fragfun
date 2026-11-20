import { route, requireUser, parseJson, err } from "@/lib/api";
import { q, q1 } from "@/lib/db";
import { profileSchema } from "@/lib/validation";
import { clipsByCreator } from "@/lib/repos/clips";

/** The signed-in creator's dashboard data. */
export const GET = route(async () => {
  const user = await requireUser();
  const profile = await q1("select username, display_name, avatar_url, bio, twitter from creator_profiles where user_id = $1", [user.id]);
  const clips = await clipsByCreator(user.id, true);
  const trades = await q(
    `select ti.id, ti.side, ti.status, ti.transaction_signature, ti.sol_delta_lamports, ti.token_delta, ti.created_at, t.symbol, t.mint_address
       from trade_intents ti join tokens t on t.id = ti.token_id
      where ti.user_id = $1 and ti.status <> 'prepared' order by ti.created_at desc limit 50`,
    [user.id],
  );
  return { wallet: user.wallet, isAdmin: user.isAdmin, profile, clips, trades };
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  const b = await parseJson(req, profileSchema);
  if (b.username) {
    const taken = await q1("select 1 from creator_profiles where lower(username) = lower($1) and user_id <> $2", [b.username, user.id]);
    if (taken) throw err.conflict("That username is taken.", "username_taken");
  }
  if (b.avatarUrl && !b.avatarUrl.includes("/avatars/")) throw err.badRequest("Upload your avatar through Fragfun.");
  await q(
    `insert into creator_profiles (user_id, username, display_name, bio, twitter, avatar_url, updated_at)
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict (user_id) do update set username = excluded.username, display_name = excluded.display_name, bio = excluded.bio,
       twitter = excluded.twitter, avatar_url = excluded.avatar_url, updated_at = now()`,
    [user.id, b.username ?? null, b.displayName || null, b.bio || null, b.twitter?.replace(/^@/, "") || null, b.avatarUrl || null],
  );
  return { ok: true };
});
