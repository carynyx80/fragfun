import { NextResponse, connection } from "next/server";
import { q1 } from "@/lib/db";
import { rpc } from "@/lib/solana/connection";
import { env } from "@/lib/env";
import { GENESIS_HASHES } from "@/lib/solana/company-core";
import { companySignerStatus } from "@/lib/solana/company";

/** Liveness + dependency health (used by uptime monitoring). */
export async function GET() {
  await connection();
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
  const t0 = Date.now();
  try {
    await q1("select 1");
    checks.database = { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    checks.database = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const t1 = Date.now();
  try {
    const genesis = (await Promise.race([
      rpc().getGenesisHash(),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 5000)),
    ])) as string;
    // The RPC must actually serve the configured cluster (guards against a devnet URL in a mainnet config).
    const expected = GENESIS_HASHES[env().SOLANA_NETWORK];
    checks.solanaRpc = genesis === expected
      ? { ok: true, ms: Date.now() - t1 }
      : { ok: false, error: `RPC serves a different cluster than SOLANA_NETWORK=${env().SOLANA_NETWORK}` };
  } catch (e) {
    checks.solanaRpc = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const signer = companySignerStatus();
  checks.companySigner = signer === "invalid" ? { ok: false, error: "COMPANY_SIGNER_SECRET_KEY is invalid" } : { ok: true };
  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok, network: env().SOLANA_NETWORK, companyWallet: env().COMPANY_WALLET_ADDRESS || null, videoProvider: env().VIDEO_PROVIDER, checks, at: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
