/**
 * Read-only mainnet verification of the company wallet integration. Sends NO transactions,
 * produces NO signatures, spends NO SOL.
 *
 *   npx tsx scripts/verify-mainnet.ts
 *
 * Checks: RPC serves mainnet-beta (genesis hash) · company wallet is a valid on-curve, system-owned
 * wallet and its balance · Pump program is deployed and executable · Pump Global state decodes ·
 * a create_v2 launch with the company wallet as creator simulates · a SPONSORED launch (company =
 * fee payer only, another wallet = creator) passes the guard and simulates.
 */
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { buildLaunchTransaction } from "../src/lib/solana/pump-core";
import { inspectPreparedTransaction, PUMP_PROGRAM } from "../src/lib/solana/tx-guard";
import { DEFAULT_COMPANY_WALLET, GENESIS_HASHES, parseCompanyAddress } from "../src/lib/solana/company-core";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const COMPANY = process.env.COMPANY_WALLET_ADDRESS || DEFAULT_COMPANY_WALLET;
// Funded public wallet used only as the simulated creator in the sponsored case (no signatures).
const SIM_CREATOR = new PublicKey(process.env.SIM_CREATOR ?? "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9");

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

async function main() {
  const conn = new Connection(RPC, "confirmed");
  console.log(`RPC ${RPC}\nCompany wallet ${COMPANY}\n`);

  const genesis = await conn.getGenesisHash();
  check("RPC serves Solana mainnet-beta", genesis === GENESIS_HASHES["mainnet-beta"], genesis);

  const parsed = parseCompanyAddress(COMPANY);
  check("Company address is a valid on-curve wallet", parsed.ok, parsed.ok ? "" : parsed.reason);
  if (!parsed.ok) return;
  const info = await conn.getAccountInfo(parsed.key);
  check("Company wallet exists and is system-owned", Boolean(info && info.owner.equals(SystemProgram.programId) && !info.executable));
  const balance = info?.lamports ?? 0;
  console.log(`      balance: ${(balance / 1e9).toFixed(6)} SOL`);
  const sigs = await conn.getSignaturesForAddress(parsed.key, { limit: 5 });
  console.log(`      recent transactions: ${sigs.length}${sigs[0]?.blockTime ? ` (latest ${new Date(sigs[0].blockTime * 1000).toISOString()})` : ""}`);

  const prog = await conn.getAccountInfo(PUMP_PROGRAM);
  check("Pump program deployed and executable", Boolean(prog?.executable));
  const global = await new OnlinePumpSdk(conn).fetchGlobal();
  check("Pump Global state decodes", Boolean(global), `initialRealTokenReserves=${global.initialRealTokenReserves.toString()}`);

  // 1) Company wallet as creator + fee payer (e.g. the acceptance-test launch). Simulation only.
  const l1 = await buildLaunchTransaction(conn, {
    mint: Keypair.generate().publicKey,
    user: parsed.key,
    name: "Fragfun Verify",
    symbol: "FFVER",
    uri: "https://example.com/verify.json",
    devBuyLamports: 0n,
    priorityMicroLamports: 0,
  });
  const g1 = inspectPreparedTransaction(l1.tx, COMPANY);
  check("Launch as company wallet passes guard", g1.ok, g1.problems.join("; "));
  const s1 = await conn.simulateTransaction(l1.tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    accounts: { encoding: "base64", addresses: [COMPANY] },
  });
  const cost = s1.value.accounts?.[0] ? balance - s1.value.accounts[0].lamports : null;
  check(
    "Launch as company wallet simulates on mainnet",
    s1.value.err === null,
    s1.value.err ? JSON.stringify(s1.value.err) : `units=${s1.value.unitsConsumed}, simulated cost=${cost != null ? (cost / 1e9).toFixed(6) + " SOL" : "n/a"}`,
  );

  // 2) Sponsored: another wallet creates; company wallet pays only the network fee.
  const l2 = await buildLaunchTransaction(conn, {
    mint: Keypair.generate().publicKey,
    user: SIM_CREATOR,
    name: "Fragfun Verify",
    symbol: "FFVER",
    uri: "https://example.com/verify.json",
    devBuyLamports: 0n,
    priorityMicroLamports: 0,
    feePayer: parsed.key,
  });
  const g2 = inspectPreparedTransaction(l2.tx, SIM_CREATOR.toBase58(), { sponsor: COMPANY });
  check("Sponsored launch passes guard (company = fee payer only)", g2.ok, g2.problems.join("; "));
  const s2 = await conn.simulateTransaction(l2.tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    accounts: { encoding: "base64", addresses: [COMPANY] },
  });
  const companyDelta = s2.value.accounts?.[0] ? balance - s2.value.accounts[0].lamports : null;
  // Base fee is 5,000 lamports per required signature (company, creator, mint); priority fee is 0 here.
  const expectedFee = 5_000 * l2.tx.message.header.numRequiredSignatures;
  check(
    "Sponsored launch simulates; company pays exactly the network fee",
    s2.value.err === null && companyDelta === expectedFee,
    s2.value.err ? JSON.stringify(s2.value.err) : `company would pay ${companyDelta} lamports (expected ${expectedFee})`,
  );

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`} No transactions were sent.`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
