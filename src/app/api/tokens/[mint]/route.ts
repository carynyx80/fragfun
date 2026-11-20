import { route, limit, err } from "@/lib/api";
import { getTokenByMint } from "@/lib/repos/tokens";
import { getMarket } from "@/lib/market";
import { isValidWalletAddress } from "@/lib/auth/siws";
import { q } from "@/lib/db";

export const GET = route<{ mint: string }>(async (req, { params }) => {
  const { mint } = await params;
  limit(req, "token-get", 120, 60_000);
  if (!isValidWalletAddress(mint)) throw err.notFound("Token not found.");
  const t = await getTokenByMint(mint);
  if (!t || t.clip_moderation === "removed") throw err.notFound("Token not found on Fragfun.");
  const market = await getMarket(mint);
  const fragfunTrades = await q(
    `select ti.side, ti.transaction_signature, ti.sol_delta_lamports, ti.token_delta, ti.updated_at, u.wallet_address
       from trade_intents ti join users u on u.id = ti.user_id
      where ti.token_id = $1 and ti.status = 'confirmed' order by ti.updated_at desc limit 20`,
    [t.id],
  );
  return {
    token: {
      mint: t.mint_address,
      name: t.name,
      symbol: t.symbol,
      description: t.description,
      imageUrl: t.image_url,
      metadataUri: t.metadata_uri,
      twitter: t.twitter,
      telegram: t.telegram,
      website: t.website,
      launchSignature: t.launch_signature,
      confirmedAt: t.confirmed_at,
      clipId: t.clip_id,
      clipTitle: t.clip_title,
      clipThumbnail: t.clip_thumbnail,
      creator: { wallet: t.creator_wallet, username: t.creator_username, displayName: t.creator_display_name, avatarUrl: t.creator_avatar },
    },
    market,
    fragfunTrades,
  };
});
