"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api, friendlyWalletError } from "@/lib/client";
import { signSubmitAndTrack } from "@/lib/prepared-client";
import { explorerTxUrl } from "@/lib/public-env";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface FeeState {
  mode: "shared" | "direct" | "unknown";
  distributableLamports: string | null;
  minimumLamports: string | null;
  canClaim: boolean;
  creatorVaultLamports: string | null;
  shareholders: { address: string; shareBps: number }[];
  graduated: boolean;
}

interface Resp {
  split: { platformBps: number; creatorBps: number; recipient: string } | null;
  tokens: {
    mint: string;
    symbol: string;
    name: string;
    imageUrl: string;
    clipId: string;
    feeShareStatus: "not_applicable" | "pending" | "submitted" | "configured" | "failed";
    platformBps: number | null;
    state: FeeState | null;
  }[];
}

const sol = (lamports: string | null | undefined, digits = 4) => (lamports ? (Number(lamports) / 1e9).toFixed(digits) : "0");

function SplitBadge({ status, platformBps }: { status: Resp["tokens"][number]["feeShareStatus"]; platformBps: number | null }) {
  const map = {
    configured: { t: platformBps != null ? `Split ${(10000 - platformBps) / 100}/${platformBps / 100}` : "Split active", c: "bg-ff-green/15 text-ff-green" },
    submitted: { t: "Split activating", c: "bg-white/10 text-white/70" },
    pending: { t: "Split not active", c: "bg-yellow-400/10 text-yellow-300" },
    failed: { t: "Split failed", c: "bg-ff-red/10 text-ff-red" },
    not_applicable: { t: "100% yours", c: "bg-white/10 text-white/60" },
  } as const;
  const m = map[status];
  return <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider", m.c)}>{m.t}</span>;
}

export function CreatorFeesPanel() {
  const { wallet } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["creator-fees"], queryFn: () => api<Resp>("/api/creator-fees"), refetchInterval: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);

  const run = async (mint: string, kind: "claim" | "fee-share") => {
    setBusy(`${kind}:${mint}`);
    try {
      const r = await api<{ txId: string; transaction: string }>(`/api/tokens/${mint}/${kind}`, { method: "POST", json: {} });
      const s = await signSubmitAndTrack(wallet, r.txId, r.transaction);
      if (s.signature) setLastSig(s.signature);
      if (s.status === "confirmed") toast.success(kind === "claim" ? "Creator fees claimed" : "Creator fee split activated");
      else if (s.error) toast.error(s.error);
      await qc.invalidateQueries({ queryKey: ["creator-fees"] });
    } catch (e) {
      toast.error(friendlyWalletError(e));
    } finally {
      setBusy(null);
    }
  };

  if (q.isLoading) return <Skeleton className="h-40 rounded-[24px] bg-white/[0.03]" />;
  if (q.isError || !q.data) return null;
  const { tokens, split } = q.data;

  return (
    <section className="surface rounded-[28px] p-5 sm:p-6" data-testid="creator-fees">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Earnings</p>
          <h2 className="h-section mt-2 text-2xl">Creator fees</h2>
          <p className="mt-1 max-w-xl text-sm text-white/50">
            Pump.fun pays a creator fee on every trade of your tokens. Claim it straight to your wallet.
            {split && ` New launches split it ${split.creatorBps / 100}% to you and ${split.platformBps / 100}% to Fragfun, locked on-chain.`}
          </p>
        </div>
        <Coins className="size-6 text-white/30" />
      </div>

      {!tokens.length ? (
        <p className="mt-6 text-sm text-white/45">Launch a token to start earning creator fees.</p>
      ) : (
        <ul className="mt-5 divide-y divide-white/[0.05]">
          {tokens.map((t) => {
            const s = t.state;
            const amount = s?.mode === "shared" ? s.distributableLamports : s?.mode === "direct" ? s.creatorVaultLamports : null;
            const myShare =
              s?.mode === "shared" && amount
                ? (Number(amount) * (s.shareholders.find((h) => h.shareBps && h.address !== split?.recipient)?.shareBps ?? 10000)) / 10000
                : null;
            const needsSplit = t.feeShareStatus === "pending" || t.feeShareStatus === "failed";
            return (
              <li key={t.mint} className="flex flex-wrap items-center gap-3 py-4">
                <img src={t.imageUrl} alt="" className="size-11 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/clip/${t.clipId}`} className="font-mono font-medium hover:underline">
                      ${t.symbol}
                    </Link>
                    <SplitBadge status={t.feeShareStatus} platformBps={t.platformBps} />
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {s == null ? (
                      "Fee data unavailable right now."
                    ) : s.mode === "shared" ? (
                      <>
                        <span className="num text-white">{sol(amount)} SOL</span> unclaimed
                        {myShare != null && <span> · your share ≈ {(myShare / 1e9).toFixed(4)} SOL</span>}
                        {!s.canClaim && Number(amount ?? 0) > 0 && " · below Pump.fun's minimum payout"}
                      </>
                    ) : s.mode === "direct" ? (
                      <>
                        <span className="num text-white">{sol(amount)} SOL</span> in your creator vault (covers all your tokens without a split)
                      </>
                    ) : (
                      "This wallet isn't the on-chain creator of this token."
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {needsSplit && split && (
                    <Button variant="outline" size="sm" className="h-9 rounded-full px-3" disabled={busy !== null} onClick={() => void run(t.mint, "fee-share")}>
                      {busy === `fee-share:${t.mint}` && <Loader2 className="animate-spin" />} Activate split
                    </Button>
                  )}
                  <Button size="sm" className="h-9 rounded-full px-4" disabled={busy !== null || !s?.canClaim} onClick={() => void run(t.mint, "claim")} data-testid="claim-fees">
                    {busy === `claim:${t.mint}` && <Loader2 className="animate-spin" />} Claim
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {lastSig && (
        <a href={explorerTxUrl(lastSig)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-white/50 hover:text-white">
          Last transaction <ExternalLink className="size-3" />
        </a>
      )}
    </section>
  );
}
