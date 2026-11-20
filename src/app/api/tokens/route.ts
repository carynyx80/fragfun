import { z } from "zod";
import { route, limit } from "@/lib/api";
import { listTokens } from "@/lib/repos/tokens";

const Query = z.object({ kind: z.enum(["recent", "hot"]).default("recent") });

export const GET = route(async (req) => {
  limit(req, "tokens-list", 120, 60_000);
  const { kind } = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
  return { items: await listTokens(kind) };
});
