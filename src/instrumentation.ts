/**
 * Server start hook. On the backend (Railway) it runs launch reconciliation in-process every
 * RECONCILER_INTERVAL_SECONDS, so launches awaiting a final on-chain result are resolved even when
 * the creator closed the page. Off by default (0); the /api/cron/reconcile route remains available.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const seconds = Number(process.env.RECONCILER_INTERVAL_SECONDS ?? 0);
  if (!seconds || seconds < 15) return;
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { reconcileOpenAttempts } = await import("./lib/launch/service");
      await reconcileOpenAttempts(25);
    } catch (e) {
      console.error("[reconciler]", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  }, seconds * 1000).unref();
  console.log(`[fragfun] launch reconciler every ${seconds}s`);
}
