import { route } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth/session";

export const POST = route(async () => {
  await clearSessionCookie();
  return { ok: true };
});
