import "server-only";
import { Connection, type Commitment } from "@solana/web3.js";
import { rpcUrls } from "@/lib/env";

const g = globalThis as unknown as { __ffConnections?: Connection[] };

function connections(): Connection[] {
  if (!g.__ffConnections) {
    g.__ffConnections = rpcUrls().map((url) => new Connection(url, { commitment: "confirmed" as Commitment }));
  }
  return g.__ffConnections;
}

/** Primary RPC connection (used for SDK reads that need a single Connection). */
export function rpc(): Connection {
  return connections()[0];
}

const RETRYABLE = /(429|502|503|504|timeout|timed out|ECONNRESET|fetch failed|socket hang up|Too many requests)/i;

/**
 * Run a read against the primary RPC, retrying with backoff and failing over to fallbacks
 * on transient errors. Never used for sendTransaction retries that could double-submit —
 * resubmitting the *same signed* transaction is idempotent on Solana, which is the only case we retry.
 */
export async function withRpc<T>(fn: (c: Connection) => Promise<T>, attempts = 3): Promise<T> {
  const list = connections();
  let lastErr: unknown;
  for (let i = 0; i < attempts * list.length; i++) {
    const conn = list[Math.floor(i / attempts) % list.length];
    try {
      return await fn(conn);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!RETRYABLE.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 250 * 2 ** (i % attempts)));
    }
  }
  throw lastErr;
}
