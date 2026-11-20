/**
 * Launch state machine. Pure and unit tested.
 *
 * Key rule: a timeout or an uncertain RPC response NEVER becomes `failed`. Only an on-chain error,
 * a verification mismatch, a wallet rejection before submission, or a blockhash that has provably
 * expired while the signature was never seen can produce `failed`. Everything uncertain becomes
 * `unknown` and is reconciled later.
 */
export const LAUNCH_STATUSES = [
  "draft",
  "preparing",
  "awaiting_signature",
  "submitted",
  "confirming",
  "confirmed",
  "failed",
  "unknown",
] as const;
export type LaunchStatus = (typeof LAUNCH_STATUSES)[number];

export type LaunchEvent =
  | { type: "prepare_started" }
  | { type: "prepared" }
  | { type: "prepare_failed"; reason: string }
  | { type: "signature_rejected" }
  | { type: "submitted"; signature: string }
  | { type: "seen_processed" }
  | { type: "verified" }
  | { type: "onchain_error"; reason: string }
  | { type: "verification_mismatch"; reason: string }
  | { type: "blockhash_expired_unseen" }
  | { type: "timeout" }
  | { type: "rpc_uncertain"; reason: string };

const TERMINAL: LaunchStatus[] = ["confirmed", "failed"];

export function isTerminal(s: LaunchStatus) {
  return TERMINAL.includes(s);
}

export function transition(current: LaunchStatus, ev: LaunchEvent): LaunchStatus {
  if (isTerminal(current)) return current; // terminal states are sticky
  switch (ev.type) {
    case "prepare_started":
      return current === "draft" ? "preparing" : current;
    case "prepared":
      return current === "preparing" || current === "draft" ? "awaiting_signature" : current;
    case "prepare_failed":
      return current === "preparing" || current === "draft" ? "failed" : current;
    case "signature_rejected":
      // Only meaningful before anything was broadcast.
      return current === "awaiting_signature" ? "failed" : current;
    case "submitted":
      return current === "awaiting_signature" || current === "unknown" ? "submitted" : current;
    case "seen_processed":
      return current === "submitted" || current === "unknown" ? "confirming" : current;
    case "verified":
      return current === "submitted" || current === "confirming" || current === "unknown" ? "confirmed" : current;
    case "onchain_error":
    case "verification_mismatch":
      return current === "submitted" || current === "confirming" || current === "unknown" ? "failed" : current;
    case "blockhash_expired_unseen":
      return current === "submitted" || current === "unknown" ? "failed" : current;
    case "timeout":
    case "rpc_uncertain":
      return current === "submitted" || current === "confirming" ? "unknown" : current;
  }
}
