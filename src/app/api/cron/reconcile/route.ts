import { NextResponse, type NextRequest } from "next/server";
import { reconcileOpenAttempts } from "@/lib/launch/service";

/** Scheduled reconciliation of launches still awaiting a definitive on-chain result (Vercel Cron). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await reconcileOpenAttempts(25);
  return NextResponse.json({ reconciled: results.length, statuses: results.map((r) => r.status) });
}
