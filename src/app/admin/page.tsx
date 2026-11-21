"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api, ClientApiError, friendlyWalletError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { explorerAccountUrl, explorerTxUrl } from "@/lib/public-env";
import { shortAddr, timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/common/empty-state";

type Row = Record<string, string | number | null>;
interface Overview {
  stats: Record<string, number>;
  reports: Row[];
  queue: Row[];
  failedLaunches: Row[];
  events: Row[];
  audit: Row[];
  categories: Row[];
}

const STAT_LABELS: Record<string, string> = {
  users: "Users",
  clips: "Clips",
  confirmed_launches: "Confirmed launches",
  processing_failures: "Upload processing failures",
  moderation_queue: "Moderation queue",
  open_reports: "Open reports",
  failed_launches: "Failed launches",
  launches_needing_reconciliation: "Launches needing reconciliation",
  failed_trades: "Failed trades",
};

export default function AdminPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin"], queryFn: () => api<Overview>("/api/admin/overview"), enabled: Boolean(user?.isAdmin), refetchInterval: 30_000 });
  const treasury = useQuery({
    queryKey: ["admin-treasury"],
    queryFn: () =>
      api<{
        network: string;
        address: string | null;
        signer: string;
        sponsorshipEnabled: boolean;
        clusterVerified: boolean;
        balanceLamports: number | null;
        recent: { signature: string; blockTime: string | null; ok: boolean }[];
        error: string | null;
      }>("/api/admin/treasury"),
    enabled: Boolean(user?.isAdmin),
    refetchInterval: 60_000,
  });
  const [wallet, setWallet] = useState("");
  const [cat, setCat] = useState({ slug: "", name: "" });

  const act = async (body: Record<string, unknown>) => {
    try {
      await api("/api/admin/actions", { method: "POST", json: body });
      toast.success("Done (audited)");
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      toast.error(friendlyWalletError(e));
    }
  };

  if (loading) return <Skeleton className="mx-auto mt-10 h-96 max-w-5xl rounded-2xl bg-white/[0.03]" />;
  if (!user?.isAdmin || (q.error instanceof ClientApiError && q.error.status === 403))
    return <p className="py-24 text-center text-sm text-ff-muted">This area is restricted to Fragfun administrators.</p>;
  if (q.isLoading || !q.data) return <Skeleton className="mx-auto mt-10 h-96 max-w-5xl rounded-2xl bg-white/[0.03]" />;
  const d = q.data;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <PageHeader eyebrow="Operations" title="Admin" className="pb-0 pt-4" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {Object.entries(d.stats).map(([k, v]) => (
          <div key={k} className="surface rounded-2xl p-3">
            <div className="text-xl font-semibold tabular-nums">{v}</div>
            <div className="text-xs text-ff-muted">{STAT_LABELS[k] ?? k}</div>
          </div>
        ))}
      </div>

      <section className="surface rounded-2xl p-4" data-testid="treasury">
        <h2 className="mb-3 font-semibold">Company treasury</h2>
        {!treasury.data ? (
          <Skeleton className="h-20 bg-ff-bg2" />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums">
                {treasury.data.balanceLamports != null ? `${(treasury.data.balanceLamports / 1e9).toFixed(4)} SOL` : "—"}
              </span>
              {treasury.data.address && (
                <a className="font-mono text-xs underline" href={explorerAccountUrl(treasury.data.address).replace("/token/", "/account/")} target="_blank" rel="noreferrer">
                  {treasury.data.address}
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-ff-border px-2 py-0.5">Network: {treasury.data.network}</span>
              <span className={treasury.data.clusterVerified ? "rounded-full border border-ff-green/40 px-2 py-0.5 text-ff-green" : "rounded-full border border-ff-red/40 px-2 py-0.5 text-ff-red"}>
                {treasury.data.clusterVerified ? "RPC cluster verified" : "Cluster not verified"}
              </span>
              <span className="rounded-full border border-ff-border px-2 py-0.5">Server signer: {treasury.data.signer.replace("_", " ")}</span>
              <span className="rounded-full border border-ff-border px-2 py-0.5">Fee sponsorship: {treasury.data.sponsorshipEnabled ? "ON" : "off"}</span>
            </div>
            {treasury.data.error && <p className="text-xs text-ff-red">{treasury.data.error}</p>}
            {treasury.data.recent.length > 0 && (
              <ul className="divide-y divide-white/[0.05] rounded-lg border border-ff-border text-xs">
                {treasury.data.recent.slice(0, 8).map((r) => (
                  <li key={r.signature} className="flex justify-between px-3 py-1.5">
                    <a className="font-mono underline" href={explorerTxUrl(r.signature)} target="_blank" rel="noreferrer">
                      {shortAddr(r.signature, 8)}
                    </a>
                    <span className="text-ff-muted">
                      {r.ok ? "ok" : "failed"} · {r.blockTime ? timeAgo(r.blockTime) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Reports</h2>
        {!d.reports.length ? (
          <p className="text-sm text-ff-muted">No open reports.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ff-border">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/[0.05]">
                {d.reports.map((r) => (
                  <tr key={String(r.id)}>
                    <td className="px-3 py-2">{r.target_type}</td>
                    <td className="px-3 py-2">
                      {r.target_type === "clip" ? (
                        <Link className="underline" href={`/clip/${r.target_id}`}>
                          {shortAddr(String(r.target_id), 6)}
                        </Link>
                      ) : (
                        <Link className="underline" href={r.target_type === "profile" ? `/profile/${r.target_id}` : `/token/${r.target_id}`}>
                          {shortAddr(String(r.target_id), 6)}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.reason}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-ff-muted">{r.details}</td>
                    <td className="px-3 py-2 text-ff-muted">{timeAgo(String(r.created_at))}</td>
                    <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                      {r.target_type === "clip" && (
                        <Button size="sm" variant="destructive" onClick={() => void act({ action: "remove_clip", clipId: r.target_id, reason: `report:${r.reason}` }).then(() => act({ action: "resolve_report", reportId: r.id, resolution: "actioned" }))}>
                          Remove clip
                        </Button>
                      )}
                      {r.target_type === "profile" && (
                        <Button size="sm" variant="destructive" onClick={() => void act({ action: "suspend_user", wallet: r.target_id, reason: `report:${r.reason}` }).then(() => act({ action: "resolve_report", reportId: r.id, resolution: "actioned" }))}>
                          Suspend
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => void act({ action: "resolve_report", reportId: r.id, resolution: "dismissed" })}>
                        Dismiss
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Moderation queue</h2>
        {!d.queue.length ? (
          <p className="text-sm text-ff-muted">Queue is empty.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] rounded-xl border border-ff-border">
            {d.queue.map((c) => (
              <li key={String(c.id)} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Link href={`/clip/${c.id}`} className="flex-1 truncate underline">
                  {c.title || "Untitled"}
                </Link>
                <span className="text-xs text-ff-muted">{shortAddr(String(c.wallet_address))}</span>
                <Button size="sm" onClick={() => void act({ action: "approve_clip", clipId: c.id })}>
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void act({ action: "remove_clip", clipId: c.id, reason: "moderation" })}>
                  Reject
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-semibold">Accounts</h2>
          <div className="flex gap-2">
            <Input value={wallet} onChange={(e) => setWallet(e.target.value.trim())} placeholder="Wallet address" className="h-9 border-white/[0.08] bg-white/[0.03] focus-visible:border-white/25" />
            <Button size="sm" variant="destructive" disabled={!wallet} onClick={() => void act({ action: "suspend_user", wallet, reason: "admin" })}>
              Suspend
            </Button>
            <Button size="sm" variant="outline" disabled={!wallet} onClick={() => void act({ action: "unsuspend_user", wallet })}>
              Restore
            </Button>
          </div>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Categories</h2>
          <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
            {d.categories.map((c) => (
              <span key={String(c.id)} className="rounded-full border border-ff-border px-2 py-0.5">
                {c.name} {c.is_active ? "" : "(hidden)"}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={cat.slug} onChange={(e) => setCat({ ...cat, slug: e.target.value })} placeholder="slug" className="h-9 border-white/[0.08] bg-white/[0.03] focus-visible:border-white/25" />
            <Input value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} placeholder="Name" className="h-9 border-white/[0.08] bg-white/[0.03] focus-visible:border-white/25" />
            <Button
              size="sm"
              disabled={!cat.slug || !cat.name}
              onClick={async () => {
                try {
                  await api("/api/admin/categories", { method: "POST", json: { slug: cat.slug, name: cat.name } });
                  setCat({ slug: "", name: "" });
                  await qc.invalidateQueries({ queryKey: ["admin"] });
                } catch (e) {
                  toast.error(friendlyWalletError(e));
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Failed / unresolved launches</h2>
        {!d.failedLaunches.length ? (
          <p className="text-sm text-ff-muted">None.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05] rounded-xl border border-ff-border text-sm">
            {d.failedLaunches.map((l) => (
              <li key={String(l.id)} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="font-semibold">${l.symbol}</span>
                <span className="text-xs">{l.status}</span>
                <span className="text-xs text-ff-muted">{l.error_code}</span>
                <span className="flex-1 truncate text-xs text-ff-muted">{l.error_message}</span>
                {l.transaction_signature && (
                  <a className="text-xs underline" href={explorerTxUrl(String(l.transaction_signature))} target="_blank" rel="noreferrer">
                    tx
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 font-semibold">System health (warnings & errors)</h2>
          <ul className="max-h-80 divide-y divide-white/[0.05] overflow-y-auto rounded-xl border border-ff-border text-xs">
            {d.events.map((e) => (
              <li key={String(e.id)} className="px-3 py-2">
                <span className={e.level === "error" ? "text-ff-red" : "text-yellow-400"}>{e.level}</span> · {e.source} · {timeAgo(String(e.created_at))}
                <div className="text-ff-muted">{e.message}</div>
              </li>
            ))}
            {!d.events.length && <li className="px-3 py-4 text-ff-muted">No recent problems.</li>}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-semibold">Audit log</h2>
          <ul className="max-h-80 divide-y divide-white/[0.05] overflow-y-auto rounded-xl border border-ff-border text-xs">
            {d.audit.map((a) => (
              <li key={String(a.id)} className="px-3 py-2">
                {a.action} · {a.target_type}:{shortAddr(String(a.target_id), 5)} · by {shortAddr(String(a.admin))} · {timeAgo(String(a.created_at))}
              </li>
            ))}
            {!d.audit.length && <li className="px-3 py-4 text-ff-muted">No admin actions yet.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
