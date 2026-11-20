/**
 * Values that are safe to expose to the browser. Only NEXT_PUBLIC_* variables.
 */
export const publicEnv = {
  network: (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? "devnet") as "mainnet-beta" | "devnet",
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export function explorerTxUrl(signature: string) {
  const cluster = publicEnv.network === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/tx/${signature}${cluster}`;
}

export function explorerAccountUrl(address: string) {
  const cluster = publicEnv.network === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/token/${address}${cluster}`;
}

export function pumpFunCoinUrl(mint: string) {
  return `https://pump.fun/coin/${mint}`;
}
