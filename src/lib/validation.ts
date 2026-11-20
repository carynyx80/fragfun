/**
 * Shared validation (client + server). Server routes always re-validate.
 */
import { z } from "zod";

export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || /^https:\/\/[^\s]+$/i.test(v), "Links must start with https://");

export const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
  mimeType: z.enum(VIDEO_MIME_TYPES, { message: "Upload an MP4, MOV or WebM video." }),
  durationSeconds: z.number().positive().max(60 * 60).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/, "Invalid file hash."),
  rightsConfirmed: z.literal(true, { message: "Confirm you own this clip or have the rights to upload it." }),
});

export const clipDetailsSchema = z.object({
  title: z.string().trim().min(3, "Title needs at least 3 characters.").max(80),
  description: z.string().trim().max(500).default(""),
  categorySlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  publish: z.boolean().default(false),
});

/** Token symbol: 1-10 uppercase letters/digits, a leading $ is stripped. */
export const tokenSymbolSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/^\$/, "").toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{1,10}$/, "Ticker must be 1–10 letters or numbers."));

export const tokenFormSchema = z.object({
  clipId: z.string().uuid(),
  name: z.string().trim().min(1, "Token name is required.").max(32, "Token name can be at most 32 characters."),
  symbol: tokenSymbolSchema,
  description: z.string().trim().max(500).default(""),
  imageSource: z.enum(["thumbnail", "upload"]),
  imageUrl: z.string().url().max(512).optional(),
  twitter: optionalUrl,
  telegram: optionalUrl,
  website: optionalUrl,
  devBuySol: z.number().min(0).max(100).default(0),
});

export const prepareLaunchSchema = tokenFormSchema.extend({
  mint: z.string().min(32).max(44),
  idempotencyKey: z.string().uuid(),
  acknowledgedRisks: z.literal(true, { message: "Please confirm you understand the launch details." }),
});

export const tradeQuoteSchema = z.object({
  mint: z.string().min(32).max(44),
  side: z.enum(["buy", "sell"]),
  /** Decimal string: SOL for buys, tokens for sells. */
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid amount."),
  slippageBps: z.number().int().min(10).max(5000),
});

export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,24}$/, "Username: 3–24 letters, numbers or underscores.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  displayName: z.string().trim().max(48).optional(),
  bio: z.string().trim().max(280).optional(),
  twitter: z
    .string()
    .trim()
    .max(64)
    .regex(/^@?[A-Za-z0-9_]{0,15}$/, "Enter an X/Twitter handle.")
    .optional(),
  avatarUrl: z.string().url().max(512).optional().or(z.literal("")),
});

export const reportSchema = z.object({
  targetType: z.enum(["clip", "profile", "token"]),
  targetId: z.string().min(1).max(64),
  reason: z.enum(["copyright", "spam", "scam", "harassment", "nsfw", "violence", "other"]),
  details: z.string().trim().max(1000).optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters.").max(64),
  cursor: z.coerce.number().int().min(0).max(1000).default(0),
});

/** Convert a decimal string to integer base units without floating point error. */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimal places.`);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

export function fromBaseUnits(units: bigint | string, decimals: number, maxFraction = decimals): string {
  const v = BigInt(units);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  if (frac) frac = "." + frac;
  return `${neg ? "-" : ""}${whole}${frac}`;
}
