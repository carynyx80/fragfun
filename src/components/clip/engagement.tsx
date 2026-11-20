"use client";

import { useState } from "react";
import { Flag, Heart, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api, friendlyWalletError } from "@/lib/client";
import { useAuth } from "@/hooks/use-auth";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReportDialog } from "./report-dialog";

export function trackView(clipId: string) {
  void api(`/api/clips/${clipId}/engage`, { method: "POST", json: { type: "view" } }).catch(() => undefined);
}

export function LikeButton({ clipId, initialLiked, initialCount, vertical }: { clipId: string; initialLiked: boolean; initialCount: number; vertical?: boolean }) {
  const { user, signIn } = useAuth();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      disabled={busy}
      className={cn("flex items-center gap-1.5 text-sm", vertical && "flex-col gap-1 text-xs")}
      onClick={async () => {
        if (!user) {
          await signIn();
          return;
        }
        setBusy(true);
        const next = !liked;
        setLiked(next);
        setCount((c) => c + (next ? 1 : -1));
        try {
          await api(`/api/clips/${clipId}/engage`, { method: "POST", json: { type: next ? "like" : "unlike" } });
        } catch (e) {
          setLiked(!next);
          setCount((c) => c + (next ? -1 : 1));
          toast.error(friendlyWalletError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className={cn("flex size-10 items-center justify-center rounded-full bg-white/10 backdrop-blur", !vertical && "size-9 bg-ff-card")}>
        <Heart className={cn("size-[18px]", liked && "fill-ff-red text-ff-red")} />
      </span>
      {compact(Math.max(0, count))}
    </button>
  );
}

export function ShareButton({ clipId, title, vertical }: { clipId: string; title: string; vertical?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Share"
      className={cn("flex items-center gap-1.5 text-sm", vertical && "flex-col gap-1 text-xs")}
      onClick={async () => {
        const url = `${window.location.origin}/clip/${clipId}`;
        try {
          if (navigator.share) await navigator.share({ title, url });
          else {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied");
          }
          void api(`/api/clips/${clipId}/engage`, { method: "POST", json: { type: "share" } }).catch(() => undefined);
        } catch {
          /* share sheet dismissed */
        }
      }}
    >
      <span className={cn("flex size-10 items-center justify-center rounded-full bg-white/10 backdrop-blur", !vertical && "size-9 bg-ff-card")}>
        <Share2 className="size-[18px]" />
      </span>
      Share
    </button>
  );
}

export function ReportButton({ targetType, targetId, vertical }: { targetType: "clip" | "profile" | "token"; targetId: string; vertical?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Report" className={cn("flex items-center gap-1.5 text-sm", vertical && "flex-col gap-1 text-xs")} onClick={() => setOpen(true)}>
        <span className={cn("flex size-10 items-center justify-center rounded-full bg-white/10 backdrop-blur", !vertical && "size-9 bg-ff-card")}>
          <Flag className="size-[18px]" />
        </span>
        Report
      </button>
      <ReportDialog open={open} onOpenChange={setOpen} targetType={targetType} targetId={targetId} />
    </>
  );
}
