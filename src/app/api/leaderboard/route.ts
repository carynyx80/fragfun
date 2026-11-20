import { route, limit } from "@/lib/api";
import { creatorLeaderboard } from "@/lib/repos/users";
import { listTokens } from "@/lib/repos/tokens";
import { trendingClips } from "@/lib/repos/clips";

export const GET = route(async (req) => {
  limit(req, "leaderboard", 60, 60_000);
  const [creators, tokens, clips] = await Promise.all([creatorLeaderboard(25), listTokens("hot", 25), trendingClips(25)]);
  return { creators, tokens, clips };
});
