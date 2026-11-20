import { PublicKey } from "@solana/web3.js";
import { route, requireUser, limit, err } from "@/lib/api";
import { withRpc } from "@/lib/solana/connection";
import { fetchBalances } from "@/lib/solana/pump-core";
import { isValidWalletAddress } from "@/lib/auth/siws";

/** SOL and token balance for the signed-in wallet. */
export const GET = route(async (req) => {
  const user = await requireUser();
  limit(req, "balances", 60, 60_000, user.id);
  const mint = req.nextUrl.searchParams.get("mint");
  if (mint && !isValidWalletAddress(mint)) throw err.badRequest("Invalid mint.");
  const b = await withRpc((c) => fetchBalances(c, new PublicKey(user.wallet), mint ? new PublicKey(mint) : undefined));
  return { wallet: user.wallet, lamports: b.lamports, tokenAmount: b.tokenAmount };
});
