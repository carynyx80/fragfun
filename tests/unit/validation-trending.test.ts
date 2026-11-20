import { describe, expect, it } from "vitest";
import {
  tokenFormSchema,
  tokenSymbolSchema,
  uploadRequestSchema,
  prepareLaunchSchema,
  tradeQuoteSchema,
  toBaseUnits,
  fromBaseUnits,
} from "@/lib/validation";
import { clipTrendingScore, tokenTrendingScore, creatorScore } from "@/lib/trending";
import { sanitizeSuggestions } from "@/lib/ai/assistant";
import { rateLimit, _resetRateLimits } from "@/lib/rate-limit";
import { sniffImage, sniffVideo } from "@/lib/storage";

const uuid = "8b1c3a4e-2f5d-4c6b-9a7e-1d2f3a4b5c6d";

describe("token form validation", () => {
  it("normalises tickers", () => {
    expect(tokenSymbolSchema.parse("$jump6")).toBe("JUMP6");
    expect(() => tokenSymbolSchema.parse("TOO-LONG-TICKER")).toThrow();
    expect(() => tokenSymbolSchema.parse("$")).toThrow();
    expect(() => tokenSymbolSchema.parse("A B")).toThrow();
  });

  it("validates the token form", () => {
    const ok = tokenFormSchema.parse({ clipId: uuid, name: "Crazy Highway Jump", symbol: "$JUMP6", imageSource: "thumbnail" });
    expect(ok.symbol).toBe("JUMP6");
    expect(ok.devBuySol).toBe(0);
    expect(() => tokenFormSchema.parse({ clipId: uuid, name: "x".repeat(33), symbol: "A", imageSource: "thumbnail" })).toThrow();
    expect(() => tokenFormSchema.parse({ clipId: uuid, name: "ok", symbol: "A", imageSource: "thumbnail", website: "http://insecure" })).toThrow();
    expect(() => tokenFormSchema.parse({ clipId: uuid, name: "ok", symbol: "A", imageSource: "thumbnail", website: "javascript:alert(1)" })).toThrow();
    expect(tokenFormSchema.parse({ clipId: uuid, name: "ok", symbol: "A", imageSource: "thumbnail", website: "" }).website).toBeUndefined();
  });

  it("requires explicit launch acknowledgement and idempotency key", () => {
    const base = { clipId: uuid, name: "ok", symbol: "A", imageSource: "thumbnail", mint: "So11111111111111111111111111111111111111112" };
    expect(() => prepareLaunchSchema.parse({ ...base, idempotencyKey: uuid })).toThrow();
    expect(prepareLaunchSchema.parse({ ...base, idempotencyKey: uuid, acknowledgedRisks: true }).acknowledgedRisks).toBe(true);
  });
});

describe("upload validation", () => {
  const good = { filename: "a.mp4", size: 1000, mimeType: "video/mp4", contentHash: "a".repeat(64), rightsConfirmed: true };
  it("accepts supported video", () => expect(uploadRequestSchema.parse(good).mimeType).toBe("video/mp4"));
  it("requires rights confirmation", () => expect(() => uploadRequestSchema.parse({ ...good, rightsConfirmed: false })).toThrow());
  it("rejects other types", () => expect(() => uploadRequestSchema.parse({ ...good, mimeType: "image/gif" })).toThrow());
  it("rejects bad hashes", () => expect(() => uploadRequestSchema.parse({ ...good, contentHash: "xyz" })).toThrow());

  it("sniffs containers from magic bytes", () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x18, ...Buffer.from("ftypisom"), 0, 0]);
    const mov = new Uint8Array([0, 0, 0, 0x14, ...Buffer.from("ftypqt  "), 0, 0]);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffVideo(mp4)).toBe("video/mp4");
    expect(sniffVideo(mov)).toBe("video/quicktime");
    expect(sniffVideo(webm)).toBe("video/webm");
    expect(sniffVideo(new Uint8Array(20))).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0]))).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("amount conversion (no floating point)", () => {
  it("converts SOL to lamports exactly", () => {
    expect(toBaseUnits("0.1", 9)).toBe(100_000_000n);
    expect(toBaseUnits("1.000000001", 9)).toBe(1_000_000_001n);
    expect(toBaseUnits("12", 6)).toBe(12_000_000n);
    expect(() => toBaseUnits("0.0000001", 6)).toThrow();
  });
  it("formats base units", () => {
    expect(fromBaseUnits(1_500_000_000n, 9)).toBe("1.5");
    expect(fromBaseUnits("-2500000", 6)).toBe("-2.5");
    expect(fromBaseUnits(123_456_789n, 6, 2)).toBe("123.45");
  });
  it("validates trade quote input", () => {
    expect(() => tradeQuoteSchema.parse({ mint: "x".repeat(32), side: "buy", amount: "1e9", slippageBps: 100 })).toThrow();
    expect(() => tradeQuoteSchema.parse({ mint: "x".repeat(32), side: "buy", amount: "1", slippageBps: 9000 })).toThrow();
  });
});

describe("ranking formulas", () => {
  it("rewards recent engagement and decays with age", () => {
    const fresh = clipTrendingScore({ views24h: 100, likes24h: 10, shares24h: 0, warVotes24h: 0, volume24hUsd: null, ageHours: 1 });
    const old = clipTrendingScore({ views24h: 100, likes24h: 10, shares24h: 0, warVotes24h: 0, volume24hUsd: null, ageHours: 48 });
    expect(fresh).toBeGreaterThan(old);
    expect(clipTrendingScore({ views24h: 0, likes24h: 0, shares24h: 0, warVotes24h: 0, volume24hUsd: null, ageHours: 1 })).toBe(0);
  });
  it("uses only verified volume for markets", () => {
    expect(tokenTrendingScore({ volume24hUsd: null, fragfunTraders24h: 50, ageHours: 1 })).toBe(0);
    expect(tokenTrendingScore({ volume24hUsd: 1000, fragfunTraders24h: 0, ageHours: 1 })).toBeGreaterThan(0);
  });
  it("scores creators on launches and engagement", () => {
    expect(creatorScore({ publishedClips: 1, confirmedLaunches: 1, totalViews: 0, totalLikes: 0 })).toBe(7);
  });
});

describe("AI suggestion guardrails", () => {
  it("removes financial promises, endorsements and malformed tickers", () => {
    const s = sanitizeSuggestions({
      names: ["Highway Hero", "100x Moon Jump", "Official Rockstar Coin"],
      tickers: ["$jump", "to-the-moon", "GUARANTEE"],
      description: "Guaranteed profit for holders",
      captions: ["Send it", "Get rich with $JUMP"],
    });
    expect(s.names).toEqual(["Highway Hero"]);
    expect(s.tickers).toEqual(["JUMP", "TOTHEMOON"]);
    expect(s.description).toBe("");
    expect(s.captions).toEqual(["Send it"]);
  });
});

describe("rate limiter", () => {
  it("blocks after the limit within a window and resets after", () => {
    _resetRateLimits();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, now).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, now).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, now + 1001).ok).toBe(true);
  });
});
