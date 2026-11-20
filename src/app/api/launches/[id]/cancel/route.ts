import { route, requireUser } from "@/lib/api";
import { cancelLaunch } from "@/lib/launch/service";

/** Called when the user rejects the wallet signature. Only affects attempts that were never broadcast. */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  return cancelLaunch(user.id, id);
});
