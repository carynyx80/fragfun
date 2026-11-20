import { route, limit } from "@/lib/api";
import { trendingClips } from "@/lib/repos/clips";

export const GET = route(async (req) => {
  limit(req, "clips-trending", 120, 60_000);
  return { items: await trendingClips(12) };
});
