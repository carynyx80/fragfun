import { route, requireAdmin } from "@/lib/api";
import { q, q1 } from "@/lib/db";

export const GET = route(async () => {
  await requireAdmin();
  const stats = await q1(
    `select (select count(*) from users)::int as users,
            (select count(*) from clips)::int as clips,
            (select count(*) from clips where processing_status = 'failed')::int as processing_failures,
            (select count(*) from clips where moderation_status = 'pending' and processing_status = 'ready')::int as moderation_queue,
            (select count(*) from tokens where launch_status = 'confirmed')::int as confirmed_launches,
            (select count(*) from token_launch_attempts where status = 'failed')::int as failed_launches,
            (select count(*) from token_launch_attempts where status = 'unknown')::int as launches_needing_reconciliation,
            (select count(*) from trade_intents where status = 'failed')::int as failed_trades,
            (select count(*) from reports where status = 'open')::int as open_reports`,
  );
  const reports = await q(
    `select r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at, u.wallet_address as reporter
       from reports r join users u on u.id = r.reporter_id where r.status = 'open' order by r.created_at desc limit 100`,
  );
  const queue = await q(
    `select c.id, c.title, c.thumbnail_url, c.created_at, u.wallet_address from clips c join users u on u.id = c.creator_id
      where c.moderation_status = 'pending' and c.processing_status = 'ready' order by c.created_at asc limit 50`,
  );
  const failedLaunches = await q(
    `select a.id, a.status, a.error_code, a.error_message, a.transaction_signature, a.updated_at, t.symbol, t.mint_address
       from token_launch_attempts a join tokens t on t.id = a.token_id
      where a.status in ('failed', 'unknown') order by a.updated_at desc limit 50`,
  );
  const events = await q(
    `select id, level, source, message, context, created_at from system_events where level in ('warn','error') order by created_at desc limit 50`,
  );
  const audit = await q(
    `select l.id, l.action, l.target_type, l.target_id, l.details, l.created_at, u.wallet_address as admin
       from admin_audit_logs l join users u on u.id = l.admin_id order by l.created_at desc limit 50`,
  );
  const categories = await q("select id, slug, name, game, sort_order, is_active from categories order by sort_order, name");
  return { stats, reports, queue, failedLaunches, events, audit, categories };
});
