import { z } from "zod";
import { route, requireAdmin, parseJson } from "@/lib/api";
import { tx } from "@/lib/db";

const Upsert = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(2).max(40),
  game: z.string().trim().max(60).optional(),
  sortOrder: z.number().int().min(0).max(1000).default(100),
  isActive: z.boolean().default(true),
});

export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const c = await parseJson(req, Upsert);
  await tx(async (db) => {
    await db.query(
      `insert into categories (slug, name, game, sort_order, is_active) values ($1, $2, $3, $4, $5)
       on conflict (slug) do update set name = excluded.name, game = excluded.game, sort_order = excluded.sort_order, is_active = excluded.is_active`,
      [c.slug, c.name, c.game ?? null, c.sortOrder, c.isActive],
    );
    await db.query("insert into admin_audit_logs (admin_id, action, target_type, target_id, details) values ($1, 'upsert_category', 'category', $2, $3)", [
      admin.id,
      c.slug,
      JSON.stringify(c),
    ]);
  });
  return { ok: true };
});
