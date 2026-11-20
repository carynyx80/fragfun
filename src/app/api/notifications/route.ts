import { z } from "zod";
import { route, requireUser, parseJson } from "@/lib/api";
import { q } from "@/lib/db";

export const GET = route(async () => {
  const user = await requireUser();
  const items = await q(
    "select id, kind, title, body, href, read_at, created_at from notifications where user_id = $1 order by created_at desc limit 30",
    [user.id],
  );
  return { items, unread: items.filter((i) => !(i as { read_at: unknown }).read_at).length };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  await parseJson(req, z.object({ markAllRead: z.literal(true) }));
  await q("update notifications set read_at = now() where user_id = $1 and read_at is null", [user.id]);
  return { ok: true };
});
