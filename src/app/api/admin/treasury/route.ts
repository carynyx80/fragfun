import { route, requireAdmin } from "@/lib/api";
import { treasuryStatus } from "@/lib/solana/treasury";

/** Company wallet balance, recent on-chain activity and signer/sponsorship status (admin only). */
export const GET = route(async () => {
  await requireAdmin();
  return treasuryStatus();
});
