import { describe, expect, it } from "vitest";
import { transition, isTerminal, type LaunchStatus } from "@/lib/launch/state";

describe("launch state machine", () => {
  it("follows the happy path", () => {
    let s: LaunchStatus = "draft";
    s = transition(s, { type: "prepare_started" });
    expect(s).toBe("preparing");
    s = transition(s, { type: "prepared" });
    expect(s).toBe("awaiting_signature");
    s = transition(s, { type: "submitted", signature: "sig" });
    expect(s).toBe("submitted");
    s = transition(s, { type: "seen_processed" });
    expect(s).toBe("confirming");
    s = transition(s, { type: "verified" });
    expect(s).toBe("confirmed");
  });

  it("never turns a timeout or RPC uncertainty into failed", () => {
    expect(transition("submitted", { type: "timeout" })).toBe("unknown");
    expect(transition("confirming", { type: "rpc_uncertain", reason: "502" })).toBe("unknown");
    expect(transition("unknown", { type: "timeout" })).toBe("unknown");
  });

  it("only fails on definitive evidence", () => {
    expect(transition("submitted", { type: "onchain_error", reason: "x" })).toBe("failed");
    expect(transition("unknown", { type: "verification_mismatch", reason: "x" })).toBe("failed");
    expect(transition("unknown", { type: "blockhash_expired_unseen" })).toBe("failed");
    // A confirming (seen) transaction cannot be failed by blockhash expiry.
    expect(transition("confirming", { type: "blockhash_expired_unseen" })).toBe("confirming");
  });

  it("recovers unknown launches once verified", () => {
    expect(transition("unknown", { type: "verified" })).toBe("confirmed");
    expect(transition("unknown", { type: "seen_processed" })).toBe("confirming");
  });

  it("wallet rejection fails only attempts that were never broadcast", () => {
    expect(transition("awaiting_signature", { type: "signature_rejected" })).toBe("failed");
    expect(transition("submitted", { type: "signature_rejected" })).toBe("submitted");
  });

  it("keeps terminal states sticky", () => {
    expect(isTerminal("confirmed")).toBe(true);
    expect(transition("confirmed", { type: "onchain_error", reason: "late" })).toBe("confirmed");
    expect(transition("failed", { type: "verified" })).toBe("failed");
  });

  it("ignores events that do not apply", () => {
    expect(transition("preparing", { type: "verified" })).toBe("preparing");
    expect(transition("awaiting_signature", { type: "timeout" })).toBe("awaiting_signature");
  });
});
