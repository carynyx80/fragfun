import "server-only";
import { q } from "@/lib/db";

/** Persist an operational event for the admin health view. Never throws. */
export async function logEvent(
  level: "info" | "warn" | "error",
  source: string,
  message: string,
  context: Record<string, unknown> = {},
) {
  try {
    await q("insert into system_events (level, source, message, context) values ($1, $2, $3, $4)", [
      level,
      source.slice(0, 120),
      message.slice(0, 2000),
      JSON.stringify(context),
    ]);
  } catch (e) {
    console.error("[logEvent failed]", e);
  }
}

export async function notify(
  userId: string,
  kind: "upload_ready" | "upload_failed" | "launch_confirmed" | "launch_failed" | "trade_confirmed" | "trade_failed",
  title: string,
  body: string | null,
  href: string | null,
  dedupeKey: string,
) {
  try {
    await q(
      `insert into notifications (user_id, kind, title, body, href, dedupe_key)
       values ($1, $2, $3, $4, $5, $6) on conflict (dedupe_key) do nothing`,
      [userId, kind, title, body, href, dedupeKey],
    );
  } catch (e) {
    console.error("[notify failed]", e);
  }
}
