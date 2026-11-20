import { z } from "zod";
import { route, parseJson, requireUser, limit, err } from "@/lib/api";
import { q, q1 } from "@/lib/db";

const Body = z.object({ clipId: z.string().uuid() });

/** One vote per signed-in user per war. Voting is free and has no financial component. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  limit(req, "war-vote", 30, 60_000, user.id);
  const { clipId } = await parseJson(req, Body);
  const war = await q1<{ clip_a_id: string; clip_b_id: string; status: string; ends_at: string }>(
    "select clip_a_id, clip_b_id, status, ends_at from clip_wars where id = $1",
    [id],
  );
  if (!war) throw err.notFound("Clip War not found.");
  if (war.status !== "active" || Date.parse(war.ends_at) < Date.now()) throw err.conflict("This Clip War has ended.");
  if (clipId !== war.clip_a_id && clipId !== war.clip_b_id) throw err.badRequest("That clip is not in this war.");
  const ins = await q("insert into clip_war_votes (war_id, user_id, clip_id) values ($1, $2, $3) on conflict do nothing returning war_id", [id, user.id, clipId]);
  if (!ins.length) throw err.conflict("You already voted in this Clip War.", "already_voted");
  return { ok: true };
});
