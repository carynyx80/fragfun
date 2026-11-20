import { z } from "zod";
import { route, requireAdmin, parseJson, err } from "@/lib/api";
import { tx } from "@/lib/db";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve_clip"), clipId: z.string().uuid() }),
  z.object({ action: z.literal("remove_clip"), clipId: z.string().uuid(), reason: z.string().max(300) }),
  z.object({ action: z.literal("restore_clip"), clipId: z.string().uuid() }),
  z.object({ action: z.literal("suspend_user"), wallet: z.string().min(32).max(44), reason: z.string().max(300) }),
  z.object({ action: z.literal("unsuspend_user"), wallet: z.string().min(32).max(44) }),
  z.object({ action: z.literal("resolve_report"), reportId: z.string().uuid(), resolution: z.enum(["actioned", "dismissed"]) }),
  z.object({ action: z.literal("end_war"), warId: z.string().uuid() }),
]);

/**
 * Moderation actions. Every action is written to admin_audit_logs in the same transaction.
 * Admins can hide content and suspend accounts; they cannot touch on-chain tokens or user funds.
 */
export const POST = route(async (req) => {
  const admin = await requireAdmin();
  const a = await parseJson(req, Action);
  await tx(async (db) => {
    let target: [string, string];
    switch (a.action) {
      case "approve_clip":
        await db.query("update clips set moderation_status = 'approved', updated_at = now() where id = $1", [a.clipId]);
        target = ["clip", a.clipId];
        break;
      case "remove_clip":
        await db.query("update clips set moderation_status = 'removed', updated_at = now() where id = $1", [a.clipId]);
        target = ["clip", a.clipId];
        break;
      case "restore_clip":
        await db.query("update clips set moderation_status = 'approved', updated_at = now() where id = $1", [a.clipId]);
        target = ["clip", a.clipId];
        break;
      case "suspend_user": {
        if (a.wallet === admin.wallet) throw err.badRequest("You cannot suspend yourself.");
        const r = await db.query("update users set status = 'suspended' where wallet_address = $1 returning id", [a.wallet]);
        if (!r.length) throw err.notFound("User not found.");
        target = ["user", a.wallet];
        break;
      }
      case "unsuspend_user":
        await db.query("update users set status = 'active' where wallet_address = $1", [a.wallet]);
        target = ["user", a.wallet];
        break;
      case "resolve_report":
        await db.query("update reports set status = $2, resolved_by = $3, resolved_at = now() where id = $1", [a.reportId, a.resolution, admin.id]);
        target = ["report", a.reportId];
        break;
      case "end_war":
        await db.query("update clip_wars set status = 'removed' where id = $1", [a.warId]);
        target = ["war", a.warId];
        break;
    }
    await db.query("insert into admin_audit_logs (admin_id, action, target_type, target_id, details) values ($1, $2, $3, $4, $5)", [
      admin.id,
      a.action,
      target[0],
      target[1],
      JSON.stringify(a),
    ]);
  });
  return { ok: true };
});
