import { route } from "@/lib/api";
import { env } from "@/lib/env";

/** Public, non-sensitive platform info: network and the official company wallet address (transparency). */
export const GET = route(async () => {
  const e = env();
  return {
    network: e.SOLANA_NETWORK,
    companyWallet: e.COMPANY_WALLET_ADDRESS || null,
    platformFee: "none",
    feeSponsorship: e.FEATURE_FEE_SPONSORSHIP,
  };
});
