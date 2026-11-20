"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, friendlyWalletError } from "@/lib/client";
import { useAuth } from "@/hooks/use-auth";

const REASONS = [
  ["copyright", "Copyright / I own this content"],
  ["scam", "Scam or misleading token"],
  ["spam", "Spam"],
  ["harassment", "Harassment or hate"],
  ["nsfw", "Sexual content"],
  ["violence", "Real-world violence"],
  ["other", "Something else"],
] as const;

export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  targetType: "clip" | "profile" | "token";
  targetId: string;
}) {
  const { user, signIn } = useAuth();
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("copyright");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-ff-border bg-ff-bg2">
        <DialogHeader>
          <DialogTitle>Report {targetType}</DialogTitle>
          <DialogDescription>Reports are reviewed by the Fragfun team. For copyright takedowns, include proof of ownership.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {REASONS.map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-ff-border px-3 py-2 text-sm has-checked:border-ff-green">
              <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="accent-[#8bff16]" />
              {label}
            </label>
          ))}
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Details (optional)" className="mt-2 border-ff-border bg-ff-bg" />
        </div>
        <DialogFooter>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!user) {
                await signIn();
                return;
              }
              setBusy(true);
              try {
                await api("/api/reports", { method: "POST", json: { targetType, targetId, reason, details: details || undefined } });
                toast.success("Report submitted. Thank you.");
                onOpenChange(false);
              } catch (e) {
                toast.error(friendlyWalletError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {user ? "Submit report" : "Sign in to report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
