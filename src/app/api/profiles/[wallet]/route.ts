import { route, err, limit } from "@/lib/api";
import { getProfileByWallet } from "@/lib/repos/users";
import { listClips } from "@/lib/repos/clips";

export const GET = route<{ wallet: string }>(async (req, { params }) => {
  const { wallet } = await params;
  limit(req, "profile-get", 120, 60_000);
  if (!/^[A-Za-z0-9_]{3,44}$/.test(wallet)) throw err.notFound("Creator not found.");
  const profile = await getProfileByWallet(wallet);
  if (!profile || profile.status === "suspended") throw err.notFound("Creator not found.");
  const clips = await listClips({ sort: "new", creatorWallet: profile.wallet, limit: 30, offset: 0 });
  const pub: Partial<typeof profile> = { ...profile };
  delete pub.id;
  return { profile: pub, clips: clips.items };
});
