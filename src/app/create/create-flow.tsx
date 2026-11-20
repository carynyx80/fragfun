"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { Check, Loader2, Sparkles, ExternalLink, Copy, Share2, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { api, b64ToBytes, bytesToB64, friendlyWalletError, isUserRejection, ClientApiError } from "@/lib/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { VideoPlayer } from "@/components/clip/video-player";
import { UploadStep } from "./upload-step";
import { explorerTxUrl, explorerAccountUrl, pumpFunCoinUrl, publicEnv } from "@/lib/public-env";
import { shortAddr, sol } from "@/lib/format";
import { tokenFormSchema } from "@/lib/validation";
import type { ClipCardData } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "upload" | "details" | "token" | "review" | "launching" | "done";
const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "details", label: "Details" },
  { key: "token", label: "Token" },
  { key: "review", label: "Review & launch" },
];

interface ClipResp {
  clip: ClipCardData & { isOwner: boolean; isDraft: boolean; processingStatus: string; moderationStatus: string };
}

interface PrepareResp {
  attemptId: string;
  status: string;
  mint: string;
  transaction: string | null;
  preview?: {
    imageUrl: string;
    metadataUri: string;
    expectedTokens: string | null;
    fees: { networkFeeLamports: number; priorityFeeLamports: number; computeUnitLimit: number };
    simulatedCostLamports: number | null;
    walletBalanceLamports: number;
    programs: string[];
    networkFeePaidBy?: "you" | "fragfun";
  };
}

interface AttemptResp {
  attemptId: string;
  status: string;
  mint: string | null;
  name: string | null;
  symbol: string | null;
  clipId: string | null;
  signature: string | null;
  error: { code: string | null; message: string } | null;
}

function Stepper({ step }: { step: Step }) {
  const idx = Math.min(STEPS.findIndex((s) => s.key === step), 3);
  const effective = step === "launching" || step === "done" ? 4 : idx;
  return (
    <ol className="mb-8 mt-8 flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px]",
              i < effective ? "border-ff-green bg-ff-green text-black" : i === effective ? "border-white" : "border-ff-border text-ff-muted",
            )}
          >
            {i < effective ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn("hidden sm:inline", i === effective ? "text-white" : "text-ff-muted")}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="h-px flex-1 bg-ff-border" />}
        </li>
      ))}
    </ol>
  );
}

export function CreateFlow() {
  const { user, connected, signIn, signingIn, openWalletModal, wallet } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [clipId, setClipId] = useState<string | null>(params.get("clip"));
  const [step, setStep] = useState<Step>(params.get("clip") ? "details" : "upload");

  const clipQ = useQuery({
    queryKey: ["clip", clipId],
    queryFn: () => api<ClipResp>(`/api/clips/${clipId}`),
    enabled: Boolean(clipId && user),
  });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<{ items: { slug: string; name: string }[] }>("/api/categories") });

  // Details form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("gta-6");
  const [savingDetails, setSavingDetails] = useState(false);

  // Token form
  const [tName, setTName] = useState("");
  const [tSymbol, setTSymbol] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [imageSource, setImageSource] = useState<"thumbnail" | "upload">("thumbnail");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [devBuy, setDevBuy] = useState("0");
  const [formError, setFormError] = useState<string | null>(null);
  const [ai, setAi] = useState<{ names: string[]; tickers: string[]; description: string; captions: string[] } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  // Launch
  const mintRef = useRef<Keypair | null>(null);
  const idemRef = useRef<string | null>(null);
  const [ack, setAck] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PrepareResp | null>(null);
  const [attempt, setAttempt] = useState<AttemptResp | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const clip = clipQ.data?.clip;
  // Prefill the details form once per loaded clip (state adjusted during render, not in an effect).
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (clip && prefilledFor !== clip.id) {
    setPrefilledFor(clip.id);
    if (!title) setTitle(clip.title === "Untitled clip" ? "" : clip.title);
    if (!description) setDescription(clip.description);
    if (clip.category) setCategory(clip.category.slug);
  }
  const alreadyLaunched = clip?.token?.status === "confirmed" ? clip.id : null;
  useEffect(() => {
    if (alreadyLaunched) {
      toast.info("This clip already has a token.");
      router.replace(`/clip/${alreadyLaunched}`);
    }
  }, [alreadyLaunched, router]);

  // ---------------------------------------------------------------- gates
  if (!connected || !user) {
    return (
      <div className="mt-8 rounded-2xl border border-ff-border bg-ff-card p-8 text-center">
        <p className="font-medium">Connect your Solana wallet to launch</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ff-muted">
          You&apos;ll sign a free message to prove you own the wallet. Fragfun never asks for your seed phrase or private key.
        </p>
        <Button className="mt-5 h-10 rounded-full px-5 font-semibold" onClick={() => (connected ? void signIn() : openWalletModal())} disabled={signingIn}>
          {signingIn && <Loader2 className="animate-spin" />}
          {connected ? "Sign in with wallet" : "Connect wallet"}
        </Button>
        <p className="mt-4 text-xs text-ff-muted">
          No wallet? Get{" "}
          <a className="underline" href="https://phantom.com" target="_blank" rel="noreferrer">
            Phantom
          </a>{" "}
          or{" "}
          <a className="underline" href="https://solflare.com" target="_blank" rel="noreferrer">
            Solflare
          </a>
          .
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------- actions
  const saveDetails = async (publish: boolean) => {
    if (!clipId) return;
    if (title.trim().length < 3) return toast.error("Title needs at least 3 characters.");
    setSavingDetails(true);
    try {
      await api(`/api/clips/${clipId}`, { method: "PATCH", json: { title, description, categorySlug: category, publish } });
      await qc.invalidateQueries({ queryKey: ["clip", clipId] });
      if (publish) {
        if (!tName) setTName(title.slice(0, 32));
        setStep("token");
      } else {
        toast.success("Draft saved. Find it in your dashboard.");
      }
    } catch (e) {
      toast.error(friendlyWalletError(e));
    } finally {
      setSavingDetails(false);
    }
  };

  const runAi = async () => {
    if (!clipId) return;
    setAiBusy(true);
    try {
      setAi(await api(`/api/ai/suggest`, { method: "POST", json: { clipId } }));
    } catch (e) {
      toast.error(e instanceof ClientApiError ? e.message : "Assistant unavailable.");
    } finally {
      setAiBusy(false);
    }
  };

  const uploadImage = async (f: File | undefined) => {
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("purpose", "token");
    try {
      const r = await api<{ url: string }>("/api/uploads/image", { method: "POST", body: fd });
      setImageUrl(r.url);
      setImageSource("upload");
    } catch (e) {
      toast.error(friendlyWalletError(e));
    }
  };

  const tokenInput = () => ({
    clipId: clipId!,
    name: tName,
    symbol: tSymbol,
    description: tDesc,
    imageSource,
    imageUrl: imageSource === "upload" ? (imageUrl ?? undefined) : undefined,
    twitter: twitter || undefined,
    telegram: telegram || undefined,
    website: website || undefined,
    devBuySol: Number(devBuy || "0"),
  });

  const goReview = () => {
    const parsed = tokenFormSchema.safeParse(tokenInput());
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? "Check the form.");
    if (imageSource === "upload" && !imageUrl) return setFormError("Upload a token image or use the clip thumbnail.");
    if (imageSource === "thumbnail" && !clip?.thumbnailUrl) return setFormError("This clip has no thumbnail yet. Upload a token image instead.");
    setFormError(null);
    setTSymbol(parsed.data.symbol);
    setPrepared(null);
    setStep("review");
  };

  const prepare = async () => {
    setPreparing(true);
    setLaunchError(null);
    try {
      // The mint keypair is created in the browser, used to co-sign, then discarded. It never leaves this page.
      mintRef.current = Keypair.generate();
      idemRef.current = crypto.randomUUID();
      const r = await api<PrepareResp>("/api/launches", {
        method: "POST",
        json: { ...tokenInput(), symbol: tSymbol, mint: mintRef.current.publicKey.toBase58(), idempotencyKey: idemRef.current, acknowledgedRisks: true },
      });
      setPrepared(r);
    } catch (e) {
      setLaunchError(friendlyWalletError(e));
    } finally {
      setPreparing(false);
    }
  };

  const poll = async (attemptId: string) => {
    for (let i = 0; i < 120; i++) {
      const a = await api<AttemptResp>(`/api/launches/${attemptId}`).catch(() => null);
      if (a) {
        setAttempt(a);
        if (a.status === "confirmed") {
          setStep("done");
          void qc.invalidateQueries();
          return;
        }
        if (a.status === "failed") {
          setLaunchError(a.error?.message ?? "The launch failed.");
          setStep("review");
          setPrepared(null);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    setLaunchError("We have not seen a final result yet. Your launch status is saved; check your dashboard shortly.");
  };

  const signAndLaunch = async () => {
    if (!prepared?.transaction || !mintRef.current) return;
    if (!wallet.signTransaction) return toast.error("This wallet cannot sign transactions.");
    setLaunchError(null);
    let signedB64: string;
    try {
      const tx = VersionedTransaction.deserialize(b64ToBytes(prepared.transaction));
      const signed = await wallet.signTransaction(tx);
      signed.sign([mintRef.current]);
      signedB64 = bytesToB64(signed.serialize());
    } catch (e) {
      if (isUserRejection(e)) await api(`/api/launches/${prepared.attemptId}/cancel`, { method: "POST", json: {} }).catch(() => undefined);
      setLaunchError(friendlyWalletError(e));
      setPrepared(null);
      return;
    }
    setStep("launching");
    try {
      const a = await api<AttemptResp>(`/api/launches/${prepared.attemptId}/submit`, { method: "POST", json: { signedTransaction: signedB64 } });
      setAttempt(a);
      mintRef.current = null;
      await poll(prepared.attemptId);
    } catch (e) {
      setLaunchError(friendlyWalletError(e));
      // Submission may still have reached the network; keep polling the saved attempt.
      await poll(prepared.attemptId);
    }
  };

  const devBuyNum = Number(devBuy || "0");
  const symbolPreview = tSymbol.replace(/^\$/, "").toUpperCase();

  // ---------------------------------------------------------------- render
  return (
    <div>
      <Stepper step={step} />

      {step === "upload" && (
        <UploadStep
          onReady={(id) => {
            setClipId(id);
            router.replace(`/create?clip=${id}`);
            setStep("details");
          }}
        />
      )}

      {step === "details" && (
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-ff-border bg-black">
            {clip ? (
              <VideoPlayer source={clip.playback} poster={clip.thumbnailUrl} className="aspect-[9/14] w-full" />
            ) : (
              <div className="flex aspect-[9/14] items-center justify-center">
                <Loader2 className="animate-spin text-ff-muted" />
              </div>
            )}
          </div>
          <div className="space-y-4">
            {clip && clip.processingStatus !== "ready" && (
              <p className="rounded-xl border border-ff-border bg-ff-card px-4 py-3 text-sm text-ff-muted">Status: {clip.processingStatus}. You can launch once it is ready.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="title">Clip title</Label>
              <Input id="title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Crazy highway jump" className="h-10 border-ff-border bg-ff-bg2" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="What happened in this moment?" className="min-h-24 border-ff-border bg-ff-bg2" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-2">
                {cats.data?.items.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setCategory(c.slug)}
                    className={cn("rounded-full border px-3 py-1.5 text-sm", category === c.slug ? "border-ff-green text-white" : "border-ff-border text-ff-muted hover:text-white")}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="outline" disabled={savingDetails} onClick={() => void saveDetails(false)} className="h-10 rounded-full border-ff-border">
                Save as draft
              </Button>
              <Button disabled={savingDetails || clip?.processingStatus !== "ready"} onClick={() => void saveDetails(true)} className="h-10 rounded-full px-5 font-semibold" data-testid="details-continue">
                {savingDetails && <Loader2 className="animate-spin" />} Publish & create token
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "token" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-ff-border bg-ff-card p-4">
            <div>
              <p className="text-sm font-medium">Need ideas?</p>
              <p className="text-xs text-ff-muted">Optional AI suggestions. You stay in control and can edit everything.</p>
            </div>
            <Button variant="outline" onClick={() => void runAi()} disabled={aiBusy} className="h-9 rounded-full border-ff-border">
              {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} Suggest
            </Button>
          </div>
          {ai && (
            <div className="space-y-3 rounded-2xl border border-ff-border bg-ff-bg2 p-4 text-sm">
              <div className="flex flex-wrap gap-2">
                {ai.names.map((n) => (
                  <button key={n} type="button" onClick={() => setTName(n)} className="rounded-full border border-ff-border px-3 py-1 hover:border-white">
                    {n}
                  </button>
                ))}
                {ai.tickers.map((t) => (
                  <button key={t} type="button" onClick={() => setTSymbol(t)} className="rounded-full border border-ff-border px-3 py-1 font-semibold hover:border-white">
                    ${t}
                  </button>
                ))}
              </div>
              {ai.description && (
                <button type="button" onClick={() => setTDesc(ai.description)} className="block text-left text-ff-muted hover:text-white">
                  “{ai.description}” <span className="text-xs text-ff-green">Use</span>
                </button>
              )}
              {ai.captions.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="block text-left text-xs text-ff-muted hover:text-white"
                  onClick={() => {
                    void navigator.clipboard.writeText(c);
                    toast.success("Caption copied");
                  }}
                >
                  Caption: {c} <Copy className="inline size-3" />
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tname">Token name</Label>
              <Input id="tname" value={tName} maxLength={32} onChange={(e) => setTName(e.target.value)} placeholder="Crazy Highway Jump" className="h-10 border-ff-border bg-ff-bg2" data-testid="token-name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tsym">Ticker</Label>
              <Input
                id="tsym"
                value={tSymbol}
                maxLength={11}
                onChange={(e) => setTSymbol(e.target.value.toUpperCase())}
                placeholder="$JUMP6"
                className="h-10 border-ff-border bg-ff-bg2 font-semibold"
                data-testid="token-symbol"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tdesc">Token description</Label>
            <Textarea id="tdesc" value={tDesc} maxLength={500} onChange={(e) => setTDesc(e.target.value)} placeholder="The moment and the community behind it." className="min-h-20 border-ff-border bg-ff-bg2" />
          </div>
          <div className="space-y-2">
            <Label>Token image</Label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setImageSource("thumbnail")}
                className={cn("flex items-center gap-2 rounded-xl border p-2 pr-3 text-sm", imageSource === "thumbnail" ? "border-ff-green" : "border-ff-border")}
              >
                {clip?.thumbnailUrl ? <img src={clip.thumbnailUrl} alt="" className="size-10 rounded-lg object-cover" /> : <span className="size-10 rounded-lg bg-ff-card" />}
                Clip thumbnail
              </button>
              <label className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-2 pr-3 text-sm", imageSource === "upload" ? "border-ff-green" : "border-ff-border")}>
                {imageUrl ? <img src={imageUrl} alt="" className="size-10 rounded-lg object-cover" /> : <span className="flex size-10 items-center justify-center rounded-lg bg-ff-card text-xs text-ff-muted">+</span>}
                Upload image
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void uploadImage(e.target.files?.[0])} />
              </label>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["X / Twitter", twitter, setTwitter, "https://x.com/…"],
              ["Telegram", telegram, setTelegram, "https://t.me/…"],
              ["Website", website, setWebsite, "https://…"],
            ].map(([label, value, set, ph]) => (
              <div key={label as string} className="space-y-1.5">
                <Label>{label as string} (optional)</Label>
                <Input value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)} placeholder={ph as string} className="h-10 border-ff-border bg-ff-bg2" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="devbuy">Initial buy (optional, SOL)</Label>
            <Input id="devbuy" inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ""))} className="h-10 w-40 border-ff-border bg-ff-bg2" />
            <p className="text-xs text-ff-muted">Buy some of your own token in the launch transaction. Leave at 0 to only create it.</p>
          </div>
          {formError && <p className="text-sm text-ff-red">{formError}</p>}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("details")} className="h-10 rounded-full">
              Back
            </Button>
            <Button onClick={goReview} className="h-10 rounded-full px-5 font-semibold" data-testid="token-continue">
              Review launch
            </Button>
          </div>
        </div>
      )}

      {(step === "review" || step === "launching") && (
        <div className="space-y-5">
          <div className="flex gap-4 rounded-2xl border border-ff-border bg-ff-card p-4">
            <img
              src={imageSource === "upload" ? (imageUrl ?? "") : (clip?.thumbnailUrl ?? "")}
              alt=""
              className="size-20 shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold">{tName}</span>
                <span className="font-semibold text-ff-green">${symbolPreview}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-ff-muted">{tDesc || "No description"}</p>
              <p className="mt-1 text-xs text-ff-muted">Linked clip: {clip?.title}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ff-border bg-ff-border text-sm">
            {[
              ["Network", publicEnv.network === "devnet" ? "Solana devnet" : "Solana mainnet"],
              ["Launch infrastructure", "Pump.fun bonding curve (create_v2)"],
              ["Initial buy", devBuyNum > 0 ? sol(devBuyNum) : "None"],
              ["Fragfun platform fee", "None"],
              [
                "Estimated network + priority fee",
                prepared?.preview
                  ? `${sol((prepared.preview.fees.networkFeeLamports + prepared.preview.fees.priorityFeeLamports) / 1e9, 6)}${prepared.preview.networkFeePaidBy === "fragfun" ? " (paid by Fragfun)" : ""}`
                  : "Calculated when prepared",
              ],
              [
                "Total SOL required (simulated)",
                prepared?.preview?.simulatedCostLamports != null ? sol(prepared.preview.simulatedCostLamports / 1e9, 5) : "Calculated when prepared",
              ],
              ["Your wallet balance", prepared?.preview ? sol(prepared.preview.walletBalanceLamports / 1e9) : "—"],
              ["Mint address", prepared?.mint ? shortAddr(prepared.mint, 6) : "Generated when prepared"],
            ].map(([k, v]) => (
              <div key={k} className="bg-ff-card px-4 py-3">
                <dt className="text-xs text-ff-muted">{k}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ff-muted">
            The total includes account rent for the new token, its bonding curve and your token account, any initial buy, and Pump.fun&apos;s own
            protocol fees on that buy. Pump.fun charges trading fees on every trade; Fragfun adds none.
          </p>

          {prepared?.preview && (
            <div className="flex items-start gap-2 rounded-xl border border-ff-border bg-ff-bg2 px-4 py-3 text-xs text-ff-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ff-green" />
              <span>
                Transaction simulated successfully. It only calls: Compute Budget, Associated Token Account and Pump.fun programs. Your wallet will
                show the exact transaction before you approve it.
              </span>
            </div>
          )}

          {!prepared && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-[#8bff16]" data-testid="ack-checkbox" />
              <span className="text-ff-muted">
                I understand this creates a real token on {publicEnv.network === "devnet" ? "Solana devnet" : "Solana mainnet"}, it cannot be undone,
                network fees are non-refundable, and meme tokens are volatile and may become worthless.
              </span>
            </label>
          )}

          {launchError && (
            <p className="flex items-start gap-2 rounded-xl border border-ff-red/30 bg-ff-red/5 px-4 py-3 text-sm text-ff-red" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {launchError}
            </p>
          )}

          {step === "launching" && (
            <div className="flex items-center gap-3 rounded-xl border border-ff-border bg-ff-card px-4 py-4 text-sm">
              <Loader2 className="size-4 animate-spin" />
              <div>
                <p className="font-medium">
                  {attempt?.status === "confirming" ? "Confirming on Solana…" : attempt?.status === "unknown" ? "Checking the network…" : "Submitted. Waiting for confirmation…"}
                </p>
                {attempt?.signature && (
                  <a href={explorerTxUrl(attempt.signature)} target="_blank" rel="noreferrer" className="text-xs text-ff-muted underline">
                    View transaction {shortAddr(attempt.signature, 6)}
                  </a>
                )}
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("token")} disabled={preparing} className="h-10 rounded-full">
                Back
              </Button>
              {!prepared ? (
                <Button onClick={() => void prepare()} disabled={!ack || preparing} className="h-10 rounded-full px-5 font-semibold" data-testid="prepare-launch">
                  {preparing && <Loader2 className="animate-spin" />} Prepare launch
                </Button>
              ) : (
                <Button onClick={() => void signAndLaunch()} className="h-10 rounded-full px-5 font-semibold" data-testid="sign-launch">
                  Sign & launch
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {step === "done" && attempt?.mint && (
        <div className="rounded-3xl border border-ff-green/40 bg-ff-card p-8 text-center" data-testid="launch-success">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-ff-green text-black">
            <Check className="size-6" />
          </div>
          <h2 className="mt-4 text-2xl font-bold">Your moment is now on-chain.</h2>
          <p className="mt-1 text-ff-muted">
            {attempt.name} <span className="font-semibold text-white">${attempt.symbol}</span>
          </p>
          <div className="mx-auto mt-5 max-w-md space-y-2 text-left text-sm">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-ff-border bg-ff-bg2 px-3 py-2">
              <span className="text-ff-muted">Mint</span>
              <button
                type="button"
                className="flex items-center gap-1 font-mono text-xs"
                onClick={() => {
                  void navigator.clipboard.writeText(attempt.mint!);
                  toast.success("Mint address copied");
                }}
              >
                {shortAddr(attempt.mint, 8)} <Copy className="size-3" />
              </button>
            </div>
            {attempt.signature && (
              <a href={explorerTxUrl(attempt.signature)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-ff-border bg-ff-bg2 px-3 py-2">
                <span className="text-ff-muted">Transaction</span>
                <span className="flex items-center gap-1 font-mono text-xs">
                  {shortAddr(attempt.signature, 8)} <ExternalLink className="size-3" />
                </span>
              </a>
            )}
            <div className="flex gap-2 text-xs">
              <a className="text-ff-muted underline" href={explorerAccountUrl(attempt.mint)} target="_blank" rel="noreferrer">
                Solscan
              </a>
              {publicEnv.network === "mainnet-beta" && (
                <a className="text-ff-muted underline" href={pumpFunCoinUrl(attempt.mint)} target="_blank" rel="noreferrer">
                  Pump.fun
                </a>
              )}
            </div>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            <Link href={`/clip/${attempt.clipId}`} className={cn(buttonVariants(), "h-10 rounded-full px-5 font-semibold")}>
              View market
            </Link>
            <Button
              variant="outline"
              className="h-10 rounded-full border-ff-border"
              onClick={async () => {
                const url = `${window.location.origin}/clip/${attempt.clipId}`;
                if (navigator.share) await navigator.share({ title: `$${attempt.symbol} on Fragfun`, url }).catch(() => undefined);
                else {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link copied");
                }
              }}
            >
              <Share2 /> Share
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
