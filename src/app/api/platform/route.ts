import { route } from "@/lib/api";
import { env } from "@/lib/env";

/** Public, non-sensitive platform info: network and the official company wallet address (transparency). */
export const GET = route(async () => {
  const e = env();
  return {
    network: e.SOLANA_NETWORK,
    companyWallet: e.COMPANY_WALLET_ADDRESS || null,
    platformFee: "none on launches or trades",
    creatorFeeSplit: e.PLATFORM_CREATOR_FEE_BPS && e.COMPANY_WALLET_ADDRESS
      ? { platformBps: e.PLATFORM_CREATOR_FEE_BPS, creatorBps: 10_000 - e.PLATFORM_CREATOR_FEE_BPS, recipient: e.COMPANY_WALLET_ADDRESS }
      : null,
    feeSponsorship: e.FEATURE_FEE_SPONSORSHIP,
  };
});
