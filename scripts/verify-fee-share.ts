/**
 * Read-only mainnet check of the creator-fee split (sends nothing, signs nothing):
 * finds a live bonding-curve coin whose creator is a normal wallet, then simulates
 * (sigVerify: false) the Fragfun fee-share transaction with that creator as signer:
 * create_fee_sharing_config + update_fee_shares (creator 90% / company 10%).
 * Also simulates a creator-fee claim for that coin's creator.
 *
 *   npx tsx scripts/verify-fee-share.ts
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { PUMP_SDK, bondingCurvePda, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import { buildClaimTransaction, buildFeeShareTransaction } from "../src/lib/solana/pump-core";
import { inspectPreparedTransaction, PUMP_PROGRAM } from "../src/lib/solana/tx-guard";
import { DEFAULT_COMPANY_WALLET } from "../src/lib/solana/company-core";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const COMPANY = new PublicKey(process.env.COMPANY_WALLET_ADDRESS || DEFAULT_COMPANY_WALLET);

async function findCoin(conn: Connection) {
  const sigs = await conn.getSignaturesForAddress(PUMP_PROGRAM, { limit: 60 });
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 }).catch(() => null);
    for (const b of tx?.meta?.postTokenBalances ?? []) {
      if (!b.mint.endsWith("pump")) continue;
      const mint = new PublicKey(b.mint);
      const info = await conn.getAccountInfo(bondingCurvePda(mint));
      if (!info) continue;
      const bc = PUMP_SDK.decodeBondingCurve(info);
      if (bc.complete || bc.creator.equals(feeSharingConfigPda(mint))) continue;
      if (process.argv[2] === "zero" ? !bc.creatorFee.isZero() : bc.creatorFee.isZero()) continue;
      if (!PublicKey.isOnCurve(bc.creator.toBytes())) continue;
      return { mint, creator: bc.creator };
    }
  }
  return null;
}

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const coin = await findCoin(conn);
  if (!coin) throw new Error("No suitable live coin found in recent activity; re-run.");
  console.log("coin", coin.mint.toBase58(), "creator", coin.creator.toBase58(), "| unswept creator fee bucket:", process.argv[2] === "zero" ? "empty" : "non-empty");

  const fs = await buildFeeShareTransaction(conn, {
    mint: coin.mint,
    creator: coin.creator,
    shares: [
      { address: coin.creator, shareBps: 9000 },
      { address: COMPANY, shareBps: 1000 },
    ],
    priorityMicroLamports: 0,
  });
  const g = inspectPreparedTransaction(fs.tx, coin.creator.toBase58());
  console.log("fee-share guard:", g.ok ? "OK" : g.problems, "| size:", fs.tx.serialize().length, "bytes");
  const sim = await conn.simulateTransaction(fs.tx, { sigVerify: false, replaceRecentBlockhash: true });
  console.log("fee-share simulation err:", JSON.stringify(sim.value.err), "| units:", sim.value.unitsConsumed);
  console.log((sim.value.logs ?? []).filter((l) => /Instruction:|Error|error|failed/.test(l)).slice(0, 12).join("\n"));

  const claim = await buildClaimTransaction(conn, { mint: coin.mint, creatorWallet: coin.creator, priorityMicroLamports: 0 });
  console.log("\nclaim mode:", claim.state.mode, "| vault lamports:", claim.state.creatorVaultLamports);
  const gc = inspectPreparedTransaction(claim.tx, coin.creator.toBase58());
  console.log("claim guard:", gc.ok ? "OK" : gc.problems);
  const sc = await conn.simulateTransaction(claim.tx, { sigVerify: false, replaceRecentBlockhash: true });
  console.log("claim simulation err:", JSON.stringify(sc.value.err), "| units:", sc.value.unitsConsumed);
  if (sc.value.err) console.log((sc.value.logs ?? []).slice(-8).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
