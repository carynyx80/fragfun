import { route, parseJson, requireUser, limit } from "@/lib/api";
import { prepareLaunchSchema } from "@/lib/validation";
import { prepareLaunch } from "@/lib/launch/service";
import { q } from "@/lib/db";

/** Prepare a launch: validate, pin metadata, build + simulate the create_v2 transaction (unsigned). */
export const POST = route(async (req) => {
  const user = await requireUser();
  limit(req, "launch-prepare", 10, 60 * 60_000, user.id);
  const input = await parseJson(req, prepareLaunchSchema);
  return prepareLaunch(user, input);
});

/** The signed-in creator's launch history. */
export const GET = route(async () => {
  const user = await requireUser();
  const items = await q(
    `select a.id as attempt_id, a.status, a.transaction_signature, a.error_message, a.created_at, a.updated_at,
            t.mint_address, t.name, t.symbol, t.clip_id, t.image_url
       from token_launch_attempts a join tokens t on t.id = a.token_id
      where a.creator_id = $1 order by a.created_at desc limit 50`,
    [user.id],
  );
  return { items };
});
