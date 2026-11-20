/**
 * Read-only verification of the Pump.fun integration against a live cluster.
 * Sends NO transactions and spends NO funds. It:
 *   1. builds a create_v2 launch transaction with a fresh mint and simulates it
 *      (sigVerify: false) with a funded public wallet as the simulated payer,
 *   2. finds a live bonding-curve token from recent Pump program activity and
 *      builds + simulates a buy for the same payer,
 *   3. runs the Fragfun transaction guard over every built transaction.
 *
 * Usage: SOLANA_RPC_URL=https://api.mainnet-beta.solana.com npx tsx scripts/verify-pump.ts [simPayer]
 */
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { buildLaunchTransaction, buildTradeTransaction, fetchOnchainMarket } from "../src/lib/solana/pump-core";
import { inspectPreparedTransaction, PUMP_PROGRAM } from "../src/lib/solana/tx-guard";
import { PUMP_SDK } from "@pump-fun/pump-sdk";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
// A large, public exchange wallet used ONLY as the fee payer in simulations (no signatures are produced).
const SIM_PAYER = new PublicKey(process.argv[2] ?? "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9");

async function findLiveCurveMint(conn: Connection): Promise<PublicKey | null> {
  const sigs = await conn.getSignaturesForAddress(PUMP_PROGRAM, { limit: 40 });
  for (const s of sigs) {
    if (s.err) continue;
    // Some recent mainnet transactions use a newer transaction version that web3.js v1 cannot
    // decode; skip those.
    const tx = await conn
      .getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
      .catch(() => null);
    const balances = tx?.meta?.postTokenBalances ?? [];
    for (const b of balances) {
      const mint = new PublicKey(b.mint);
      if (mint.toBase58().endsWith("pump")) {
        const m = await fetchOnchainMarket(conn, mint).catch(() => null);
        if (m?.lifecycle === "bonding_curve") return mint;
      }
    }
  }
  return null;
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  console.log("RPC:", RPC, "| simulated payer:", SIM_PAYER.toBase58());

  // 1. Launch
  const mint = Keypair.generate();
  const launch = await buildLaunchTransaction(conn, {
    mint: mint.publicKey,
    user: SIM_PAYER,
    name: "Fragfun Verify",
    symbol: "FFVER",
    uri: "https://example.com/fragfun-verify.json",
    devBuyLamports: 10_000_000n,
    priorityMicroLamports: 0,
  });
  const g1 = inspectPreparedTransaction(launch.tx, SIM_PAYER.toBase58());
  console.log("\n[launch] programs:", g1.programs.join(", "));
  console.log("[launch] guard:", g1.ok ? "OK" : g1.problems);
  console.log("[launch] signers required:", launch.tx.message.header.numRequiredSignatures);
  const sim1 = await conn.simulateTransaction(launch.tx, { sigVerify: false, replaceRecentBlockhash: true });
  console.log("[launch] simulation err:", JSON.stringify(sim1.value.err), "| units:", sim1.value.unitsConsumed);
  const createLog = sim1.value.logs?.find((l) => l.includes("Instruction: CreateV2"));
  console.log("[launch] create_v2 log present:", Boolean(createLog));
  if (sim1.value.err) console.log(sim1.value.logs?.slice(-12).join("\n"));

  // 2. Trade on a live curve
  const live = await findLiveCurveMint(conn);
  if (!live) {
    console.log("\n[trade] no live bonding-curve mint found in recent activity; skipped");
    return;
  }
  const market = await fetchOnchainMarket(conn, live);
  console.log("\n[market]", JSON.stringify(market));
  const buy = await buildTradeTransaction(conn, {
    mint: live,
    user: SIM_PAYER,
    side: "buy",
    amount: 10_000_000n,
    slippageBps: 500,
    priorityMicroLamports: 0,
  });
  const g2 = inspectPreparedTransaction(buy.tx, SIM_PAYER.toBase58());
  console.log("[buy] quote:", JSON.stringify(buy.quote));
  console.log("[buy] programs:", g2.programs.join(", "), "| guard:", g2.ok ? "OK" : g2.problems);
  const sim2 = await conn.simulateTransaction(buy.tx, { sigVerify: false, replaceRecentBlockhash: true });
  console.log("[buy] simulation err:", JSON.stringify(sim2.value.err), "| units:", sim2.value.unitsConsumed);
  if (sim2.value.err) console.log(sim2.value.logs?.slice(-12).join("\n"));
  void PUMP_SDK;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
