/**
 * Devnet test wallet helper (devnet SOL has no value).
 *   npx tsx scripts/test-wallet.ts            -> create/show wallet, print balance
 *   npx tsx scripts/test-wallet.ts airdrop    -> request 1 devnet SOL from the public faucet
 * The keypair is stored in .data/test-wallet.json (gitignored) and is used by the E2E tests.
 * Refuses to run against mainnet.
 */
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
if (!/devnet|localhost|127\.0\.0\.1/.test(RPC)) {
  console.error("Refusing: test wallet tooling is devnet/local only.");
  process.exit(1);
}
const file = path.resolve(".data/test-wallet.json");

export function loadTestWallet(): Keypair {
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

async function main() {
  const kp = loadTestWallet();
  const conn = new Connection(RPC, "confirmed");
  console.log("Test wallet:", kp.publicKey.toBase58());
  if (process.argv[2] === "airdrop") {
    const sig = await conn.requestAirdrop(kp.publicKey, 1 * LAMPORTS_PER_SOL);
    const bh = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    console.log("Airdrop confirmed:", sig);
  }
  console.log("Balance:", (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL, "SOL (devnet)");
}

if (process.argv[1]?.endsWith("test-wallet.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
