import "server-only";
import { z } from "zod";

/**
 * Server configuration. Parsed once, validated with zod.
 * Nothing in here is ever sent to the browser — public values live in public-env.ts.
 */
const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Database: a Postgres connection string (Supabase "Session pooler" URI in production).
  // When empty in development/test, an embedded PGlite database in .data/pglite is used.
  DATABASE_URL: z.string().optional().default(""),
  // Apply supabase/migrations automatically on first database connection (backend deployments).
  AUTO_MIGRATE: bool(false),
  PGLITE_DIR: z.string().default(".data/pglite"),

  // Supabase (storage for images; database is reached through DATABASE_URL)
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  SUPABASE_STORAGE_BUCKET: z.string().default("fragfun-public"),

  // Sessions
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(72),

  // Solana
  SOLANA_RPC_URL: z.string().url().default("https://api.devnet.solana.com"),
  SOLANA_RPC_FALLBACK_URLS: z.string().optional().default(""),
  SOLANA_NETWORK: z.enum(["mainnet-beta", "devnet"]).default("devnet"),
  LAUNCH_MAX_DEV_BUY_SOL: z.coerce.number().nonnegative().default(5),
  PRIORITY_FEE_MICROLAMPORTS: z.coerce.number().int().nonnegative().default(50_000),

  // Company (treasury / operations) wallet. Public address only — safe to configure anywhere.
  COMPANY_WALLET_ADDRESS: z.string().optional().default(""),
  // Server-only signing key for the company wallet. ONLY needed if fee sponsorship is enabled.
  // Base58 64-byte secret key or a JSON byte array. Never logged, never sent to the browser.
  COMPANY_SIGNER_SECRET_KEY: z.string().optional().default(""),
  // Company pays Solana network fees for users' launches/trades. Off unless explicitly enabled.
  FEATURE_FEE_SPONSORSHIP: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  SPONSOR_MAX_FEE_LAMPORTS_PER_TX: z.coerce.number().int().positive().default(100_000),
  SPONSOR_MAX_TX_PER_DAY: z.coerce.number().int().nonnegative().default(200),
  SPONSOR_MAX_TX_PER_USER_PER_DAY: z.coerce.number().int().nonnegative().default(5),

  // Video
  VIDEO_PROVIDER: z.enum(["mux", "local"]).default("local"),
  MUX_TOKEN_ID: z.string().optional().default(""),
  MUX_TOKEN_SECRET: z.string().optional().default(""),
  MUX_WEBHOOK_SECRET: z.string().optional().default(""),
  VIDEO_MAX_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
  VIDEO_MAX_DURATION_SECONDS: z.coerce.number().int().positive().default(90),
  LOCAL_DATA_DIR: z.string().default(".data"),

  // Token metadata (IPFS)
  METADATA_PROVIDER: z.enum(["pinata", "self"]).default("self"),
  PINATA_JWT: z.string().optional().default(""),
  PINATA_GATEWAY: z.string().default("https://gateway.pinata.cloud"),

  // Market data
  GECKOTERMINAL_API_URL: z.string().url().default("https://api.geckoterminal.com/api/v2"),
  SOL_USD_PRICE_URL: z
    .string()
    .url()
    .default("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"),
  MARKET_CACHE_SECONDS: z.coerce.number().int().positive().default(20),

  // AI assistant (optional)
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().default("claude-opus-5-5"),

  // Admin
  ADMIN_WALLETS: z.string().optional().default(""),
  // Backend only: reconcile pending launches in-process every N seconds (0 = off; use the cron route instead).
  RECONCILER_INTERVAL_SECONDS: z.coerce.number().int().nonnegative().default(0),

  // Feature flags
  FEATURE_AI_ASSISTANT: bool(true),
  FEATURE_CLIP_WARS: bool(true),
  FEATURE_TRADING: bool(true),
  FEATURE_LAUNCHES: bool(true),
  AUTO_APPROVE_CLIPS: bool(true),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const raw = { ...process.env };
  if (!raw.SESSION_SECRET && raw.NODE_ENV !== "production") {
    // Development-only fallback so the app boots without a .env file.
    raw.SESSION_SECRET = "dev-only-insecure-session-secret-change-me-please";
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid server configuration:\n${issues.join("\n")}`);
  }
  const e = parsed.data;
  const companyProblem = validateCompanyConfig(e);
  if (companyProblem) throw new Error(`Invalid company wallet configuration: ${companyProblem}`);
  if (e.NODE_ENV === "production") {
    const problems: string[] = [];
    if (!e.DATABASE_URL) problems.push("DATABASE_URL is required in production");
    // Not fatal: local video works on a single instance with a persistent volume (e.g. Railway), and
    // mainnet launches are refused at launch time until METADATA_PROVIDER=pinata (see launch service).
    if (e.VIDEO_PROVIDER === "local") console.warn("[fragfun] VIDEO_PROVIDER=local in production: use a persistent volume, or Mux.");
    if (e.SOLANA_NETWORK === "mainnet-beta" && e.METADATA_PROVIDER !== "pinata")
      console.warn("[fragfun] Mainnet launches are disabled until METADATA_PROVIDER=pinata is configured.");
    if (e.SESSION_SECRET.startsWith("dev-only")) problems.push("SESSION_SECRET must be set");
    if (problems.length && process.env.FRAGFUN_SKIP_PROD_CHECKS !== "1") {
      throw new Error(`Production configuration incomplete:\n${problems.join("\n")}`);
    }
  }
  cached = e;
  return e;
}

export function adminWallets(): Set<string> {
  return new Set(
    env()
      .ADMIN_WALLETS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function rpcUrls(): string[] {
  const e = env();
  return [e.SOLANA_RPC_URL, ...e.SOLANA_RPC_FALLBACK_URLS.split(",").map((s) => s.trim())].filter(Boolean);
}

/** Structural checks only (no key material is decoded here; see solana/company.ts). */
export function validateCompanyConfig(e: Pick<ServerEnv, "COMPANY_WALLET_ADDRESS" | "COMPANY_SIGNER_SECRET_KEY" | "FEATURE_FEE_SPONSORSHIP">): string | null {
  const addr = e.COMPANY_WALLET_ADDRESS;
  if (addr && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return "COMPANY_WALLET_ADDRESS is not a base58 Solana address";
  if (e.FEATURE_FEE_SPONSORSHIP && !addr) return "FEATURE_FEE_SPONSORSHIP requires COMPANY_WALLET_ADDRESS";
  if (e.FEATURE_FEE_SPONSORSHIP && !e.COMPANY_SIGNER_SECRET_KEY)
    return "FEATURE_FEE_SPONSORSHIP requires COMPANY_SIGNER_SECRET_KEY (server-side signer)";
  return null;
}
