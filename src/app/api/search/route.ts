import { route, limit } from "@/lib/api";
import { searchSchema } from "@/lib/validation";
import { searchAll } from "@/lib/repos/clips";

export const GET = route(async (req) => {
  limit(req, "search", 60, 60_000);
  const { q, cursor } = searchSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return searchAll(q, cursor);
});
