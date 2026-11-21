import { route, requireUser, limit } from "@/lib/api";
import { preparedStatus } from "@/lib/fees/service";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const { id } = await params;
  const user = await requireUser();
  limit(req, "prepared-status", 90, 60_000, user.id);
  return preparedStatus(user.id, id);
});
