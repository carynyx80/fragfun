"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { VersionedTransaction } from "@solana/web3.js";
import { AlertTriangle, Loader2, ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api, b64ToBytes, bytesToB64, friendlyWalletError, ClientApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { explorerTxUrl } from "@/lib/public-env";
import { fromBaseUnits } from "@/lib/validation";
import type { MarketData } from "@/lib/types";

interface Quote {
  intentId: string;
  transaction: string;
  quote: {
    venue: "bonding_curve" | "pump_amm";
    side: "buy" | "sell";
    inputDisplay: string;
    expectedOutputDisplay: string;
    limitDisplay: string;
    slippageBps: number;
    priceImpactPct: number | null;
    fees: { networkFeeLamports: number; priorityFeeLamports: number };
  };
  lastValidBlockHeight: number;
}

const SLIPPAGES = [100, 300, 500, 1000];

export function TradePanel({ mint, symbol, market }: { mint: string; symbol: string; market: MarketData | undefined }) {
  const { user, connected, signIn, openWalletModal, wallet } = useAuth();
  const qc = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(300);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ state: string; signature: string | null; error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const balances = useQuery({
    queryKey: ["balances", mint, user?.wallet],
    queryFn: () => api<{ lamports: number; tokenAmount: string | null }>(`/api/balances?mint=${mint}`),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  // Any input change invalidates the current quote.
  const resetting = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setQuote(null);
    setError(null);
  };
  const changeSide = resetting(setSide);
  const changeAmount = resetting(setAmount);
  const changeSlippage = resetting(setSlippage);

  const unsupported = market && market.lifecycle === "unknown" && market.curveProgress === 1;

  const getQuote = async () => {
    setError(null);
    setQuoting(true);
    try {
      setQuote(await api<Quote>("/api/trade/quote", { method: "POST", json: { mint, side, amount, slippageBps: slippage } }));
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "Could not get a quote.");
    } finally {
      setQuoting(false);
    }
  };

  const confirm = async () => {
    if (!quote || inflight.current) return;
    if (!wallet.signTransaction) return toast.error("This wallet cannot sign transactions.");
    inflight.current = true; // prevents double submission
    setSubmitting(true);
    setError(null);
    try {
      const tx = VersionedTransaction.deserialize(b64ToBytes(quote.transaction));
      const signed = await wallet.signTransaction(tx);
      let r = await api<{ status: string; signature: string | null; error: string | null }>(`/api/trade/${quote.intentId}/submit`, {
        method: "POST",
        json: { signedTransaction: bytesToB64(signed.serialize()) },
      });
      setStatus({ state: r.status, signature: r.signature, error: r.error });
      for (let i = 0; i < 60 && (r.status === "submitted" || r.status === "unknown"); i++) {
        await new Promise((res) => setTimeout(res, 2000));
        r = await api(`/api/trade/${quote.intentId}`);
        setStatus({ state: r.status, signature: r.signature, error: r.error });
      }
      if (r.status === "confirmed") {
        toast.success(`${side === "buy" ? "Bought" : "Sold"} $${symbol}`);
        setAmount("");
      } else if (r.error) setError(r.error);
      setQuote(null);
      void qc.invalidateQueries({ queryKey: ["balances", mint] });
      void qc.invalidateQueries({ queryKey: ["token", mint] });
    } catch (e) {
      setError(friendlyWalletError(e));
      setQuote(null);
    } finally {
      inflight.current = false;
      setSubmitting(false);
    }
  };

  const solBal = balances.data ? balances.data.lamports / 1e9 : null;
  const tokBal = balances.data?.tokenAmount ? fromBaseUnits(balances.data.tokenAmount, 6, 2) : null;

  return (
    <div id="trade" className="surface rounded-[24px] p-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.035] p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => changeSide(s)}
            className={cn("rounded-lg py-2 text-sm font-semibold capitalize", side === s ? (s === "buy" ? "bg-ff-green text-black" : "bg-ff-red text-white") : "text-ff-muted")}
            data-testid={`trade-tab-${s}`}
          >
            {s}
          </button>
        ))}
      </div>

      {unsupported ? (
        <p className="mt-4 rounded-2xl bg-white/[0.035] p-4 text-sm text-ff-muted">
          The bonding curve is complete and the token is migrating to a liquidity pool. Trading here resumes once the pool is live.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between text-xs text-ff-muted">
            <span>{side === "buy" ? "You pay (SOL)" : `You sell ($${symbol})`}</span>
            {user && (
              <button
                type="button"
                className="hover:text-white"
                onClick={() => {
                  if (side === "buy" && solBal != null) changeAmount(Math.max(0, solBal - 0.02).toFixed(4));
                  if (side === "sell" && balances.data?.tokenAmount) changeAmount(fromBaseUnits(balances.data.tokenAmount, 6));
                }}
              >
                Balance: {side === "buy" ? (solBal != null ? `${solBal.toFixed(4)} SOL` : "—") : (tokBal ?? "0")}
              </button>
            )}
          </div>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => changeAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.0"
            aria-label="Amount"
            data-testid="trade-amount"
            className="mt-1.5 h-12 w-full rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 text-lg font-semibold tabular-nums outline-none focus:border-[#3a3a3a]"
          />
          {side === "buy" && (
            <div className="mt-2 flex gap-1.5">
              {["0.1", "0.5", "1"].map((v) => (
                <button key={v} type="button" onClick={() => changeAmount(v)} className="rounded-lg border border-ff-border px-2.5 py-1 text-xs text-ff-muted hover:text-white">
                  {v} SOL
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-ff-muted">Max slippage</span>
            <div className="flex gap-1">
              {SLIPPAGES.map((s) => (
                <button key={s} type="button" onClick={() => changeSlippage(s)} className={cn("rounded-md px-2 py-0.5", s === slippage ? "bg-white/10 text-white" : "text-ff-muted")}>
                  {s / 100}%
                </button>
              ))}
            </div>
          </div>

          {quote && (
            <dl className="mt-4 space-y-1.5 rounded-2xl bg-white/[0.035] p-3 text-xs" data-testid="trade-quote">
              <div className="flex justify-between">
                <dt className="text-ff-muted">Estimated receive</dt>
                <dd className="font-semibold">
                  {quote.quote.expectedOutputDisplay} {side === "buy" ? `$${symbol}` : "SOL"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ff-muted">{side === "buy" ? "Max SOL spent" : "Min SOL received"}</dt>
                <dd>{quote.quote.limitDisplay} SOL</dd>
              </div>
              {quote.quote.priceImpactPct != null && (
                <div className="flex justify-between">
                  <dt className="text-ff-muted">Price impact (incl. Pump.fun fees)</dt>
                  <dd className={cn(quote.quote.priceImpactPct > 5 && "text-ff-red")}>{quote.quote.priceImpactPct.toFixed(2)}%</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-ff-muted">Network + priority fee</dt>
                <dd>~{((quote.quote.fees.networkFeeLamports + quote.quote.fees.priorityFeeLamports) / 1e9).toFixed(6)} SOL</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ff-muted">Venue</dt>
                <dd>{quote.quote.venue === "bonding_curve" ? "Pump.fun bonding curve" : "PumpSwap pool"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ff-muted">Fragfun fee</dt>
                <dd>None</dd>
              </div>
            </dl>
          )}

          {error && (
            <p className="mt-3 flex gap-2 text-xs text-ff-red" role="alert">
              <AlertTriangle className="size-4 shrink-0" />
              {error}
            </p>
          )}
          {status && status.state !== "prepared" && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-ff-border px-3 py-2 text-xs">
              <span className="flex items-center gap-2">
                {(status.state === "submitted" || status.state === "unknown") && <Loader2 className="size-3 animate-spin" />}
                {status.state === "confirmed" ? "Confirmed" : status.state === "submitted" ? "Confirming…" : status.state}
              </span>
              {status.signature && (
                <a href={explorerTxUrl(status.signature)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-ff-muted hover:text-white">
                  View <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}

          <div className="mt-4">
            {!connected ? (
              <Button className="h-11 w-full rounded-xl font-semibold" onClick={openWalletModal}>
                Connect wallet
              </Button>
            ) : !user ? (
              <Button className="h-11 w-full rounded-xl font-semibold" onClick={() => void signIn()}>
                Sign in to trade
              </Button>
            ) : !quote ? (
              <Button className="h-11 w-full rounded-xl font-semibold" disabled={!amount || Number(amount) <= 0 || quoting} onClick={() => void getQuote()} data-testid="trade-quote-button">
                {quoting && <Loader2 className="animate-spin" />} Get quote
              </Button>
            ) : (
              <Button
                className={cn("h-11 w-full rounded-xl font-semibold", side === "sell" && "bg-ff-red text-white hover:bg-ff-red/80")}
                disabled={submitting}
                onClick={() => void confirm()}
              >
                {submitting && <Loader2 className="animate-spin" />} Confirm {side} in wallet
              </Button>
            )}
          </div>
          <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-ff-muted">
            <Info className="mt-0.5 size-3 shrink-0" />
            Meme tokens are extremely volatile and can go to zero. Quotes can change before your transaction lands. Fragfun never holds your funds.
          </p>
        </>
      )}
    </div>
  );
}
