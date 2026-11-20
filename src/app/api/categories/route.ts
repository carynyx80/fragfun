import { route } from "@/lib/api";
import { q } from "@/lib/db";

export const GET = route(async () => {
  const items = await q("select slug, name, game from categories where is_active order by sort_order, name");
  return { items };
});
