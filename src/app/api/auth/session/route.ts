import { route } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { q1 } from "@/lib/db";

export const GET = route(async () => {
  const user = await getSessionUser();
  if (!user) return { user: null };
  const profile = await q1<{ username: string | null; display_name: string | null; avatar_url: string | null }>(
    "select username, display_name, avatar_url from creator_profiles where user_id = $1",
    [user.id],
  );
  return { user: { id: user.id, wallet: user.wallet, isAdmin: user.isAdmin, status: user.status, ...profile } };
});
