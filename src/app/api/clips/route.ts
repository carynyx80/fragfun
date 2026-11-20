import { route, limit } from "@/lib/api";
import { listClips } from "@/lib/repos/clips";
import { z } from "zod";

const Query = z.object({
  sort: z.enum(["new", "views", "launched"]).default("new"),
  category: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  creator: z.string().min(32).max(44).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(12),
  offset: z.coerce.number().int().min(0).max(5000).default(0),
});

export const GET = route(async (req) => {
  limit(req, "clips-list", 240, 60_000);
  const p = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
  return listClips({ sort: p.sort, category: p.category, creatorWallet: p.creator, limit: p.limit, offset: p.offset });
});
