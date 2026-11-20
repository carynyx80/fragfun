import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { route, parseJson, requireUser, limit, err } from "@/lib/api";
import { q1 } from "@/lib/db";
import { aiEnabled, suggestTokenDetails } from "@/lib/ai/assistant";

const Body = z.object({ clipId: z.string().uuid() });

/** Optional AI suggestions for token name, ticker, description and captions. */
export const POST = route(async (req) => {
  const user = await requireUser();
  if (!aiEnabled()) throw err.unavailable("The AI assistant is not configured. You can enter details manually.", "ai_disabled");
  limit(req, "ai-suggest", 10, 60 * 60_000, user.id);
  const { clipId } = await parseJson(req, Body);
  const clip = await q1<{ title: string; description: string; category: string | null }>(
    `select c.title, c.description, cat.name as category from clips c left join categories cat on cat.id = c.category_id
      where c.id = $1 and c.creator_id = $2`,
    [clipId, user.id],
  );
  if (!clip) throw err.notFound("Clip not found.");
  try {
    const s = await suggestTokenDetails({ title: clip.title || "Untitled gaming clip", description: clip.description, category: clip.category });
    if (!s) throw err.unavailable("The assistant could not help with this clip. Enter details manually.", "ai_no_result");
    return s;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw err.unavailable("The assistant is busy. Try again in a minute.", "ai_busy");
    if (e instanceof Anthropic.APIError) throw err.unavailable("The assistant is unavailable right now. Enter details manually.", "ai_error");
    throw e;
  }
});
