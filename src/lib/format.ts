export function shortAddr(a: string, n = 4) {
  return a.length > n * 2 + 3 ? `${a.slice(0, n)}…${a.slice(-n)}` : a;
}

export function compact(n: number | null | undefined, opts: { prefix?: string; digits?: number } = {}) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const f = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: opts.digits ?? 1 });
  return `${opts.prefix ?? ""}${f.format(n)}`;
}

export function usd(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1000) return compact(n, { prefix: "$", digits: 2 });
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n === 0) return "$0";
  return `$${n.toPrecision(3)}`;
}

export function sol(n: number | null | undefined, digits = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n !== 0 && Math.abs(n) < 0.0001) return `${n.toExponential(2)} SOL`;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} SOL`;
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const s = Math.max(1, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function creatorName(c: { username: string | null; displayName?: string | null; wallet: string }) {
  return c.displayName || (c.username ? `@${c.username}` : shortAddr(c.wallet));
}
