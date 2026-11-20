import "server-only";
import { env } from "@/lib/env";
import { withRpc } from "./connection";
import { companySignerStatus, companyWallet, sponsorshipEnabled } from "./company";
import { GENESIS_HASHES } from "./company-core";

const cache: { at: number; value: unknown } = { at: 0, value: null };

/** Read-only view of the company wallet. Never sends transactions. */
export async function treasuryStatus() {
  if (cache.value && Date.now() - cache.at < 30_000) return cache.value as Awaited<ReturnType<typeof load>>;
  const value = await load();
  cache.at = Date.now();
  cache.value = value;
  return value;
}

async function load() {
  const e = env();
  const wallet = companyWallet();
  const base = {
    network: e.SOLANA_NETWORK,
    address: wallet?.toBase58() ?? null,
    signer: companySignerStatus(),
    sponsorshipEnabled: sponsorshipEnabled(),
    limits: {
      maxFeeLamportsPerTx: e.SPONSOR_MAX_FEE_LAMPORTS_PER_TX,
      maxTxPerDay: e.SPONSOR_MAX_TX_PER_DAY,
      maxTxPerUserPerDay: e.SPONSOR_MAX_TX_PER_USER_PER_DAY,
    },
  };
  if (!wallet) return { ...base, clusterVerified: false, balanceLamports: null, recent: [], error: "COMPANY_WALLET_ADDRESS not configured" };
  try {
    const [genesis, balance, sigs] = await withRpc((c) =>
      Promise.all([c.getGenesisHash(), c.getBalance(wallet, "confirmed"), c.getSignaturesForAddress(wallet, { limit: 15 })]),
    );
    return {
      ...base,
      clusterVerified: genesis === GENESIS_HASHES[e.SOLANA_NETWORK],
      genesisHash: genesis,
      balanceLamports: balance,
      recent: sigs.map((s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
        ok: s.err === null,
        memo: s.memo,
      })),
      error: null,
    };
  } catch (err) {
    return { ...base, clusterVerified: false, balanceLamports: null, recent: [], error: err instanceof Error ? err.message : String(err) };
  }
}
