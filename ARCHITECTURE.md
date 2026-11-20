# Architecture

```
Browser (Next.js client components, TanStack Query, Solana wallet adapter)
   │  JSON over same-origin HTTPS, HTTP-only session cookie
   ▼
Next.js 16 App Router on Vercel (Node runtime)
   ├─ Route handlers  src/app/api/**        validation (zod), auth, rate limits, CSRF origin check
   ├─ Services        src/lib/launch, trade, market, video, storage, ai
   ├─ Solana          src/lib/solana        pump-core (official SDK), tx-guard, verify-launch, RPC failover
   └─ Data            src/lib/db            postgres.js → Supabase Postgres (prod) | PGlite (dev/tests)
External: Solana RPC · Pump / PumpSwap programs · Mux · Pinata (IPFS) · Supabase Storage · GeckoTerminal · CoinGecko · Anthropic (optional)
```

## Principles

- **The server never holds keys and never signs for users.** It builds unsigned transactions; wallets sign; the
  server only broadcasts bytes it has verified are identical to what it prepared.
- **Nothing is invented.** Market fields come from RPC/GeckoTerminal/CoinGecko or are shown as unavailable. Activity
  feeds show only confirmed, verified events. Rankings use deduplicated engagement and verified volume.
- **Uncertainty is a state.** Launches and trades that cannot be confirmed become `unknown` and are reconciled.

## Key modules

| Path | Responsibility |
|---|---|
| `src/lib/env.ts` | Zod-validated server config; refuses unsafe production config (local video, missing DB, non-IPFS mainnet metadata) |
| `src/lib/api.ts` | `route()` wrapper: per-request execution, Origin check on mutations, error mapping, `requireUser/Admin`, rate limits, privacy-preserving visitor key |
| `src/lib/auth/*` | Sign-In With Solana message, ed25519 verification, nonce consumption, JWT session cookie |
| `src/lib/solana/pump-core.ts` | Launch / trade transaction builders and on-chain market reads (official Pump SDK) |
| `src/lib/solana/tx-guard.ts` | Program allow-list, fee-payer check, no lookup tables, no top-level SOL transfers, identical-bytes + all-signatures check |
| `src/lib/solana/verify-launch.ts` | Decodes `create_v2` from a confirmed transaction and checks mint/creator/metadata |
| `src/lib/launch/*` | State machine + prepare / submit / reconcile |
| `src/lib/trade/service.ts` | Quote → unsigned tx → submit once → reconcile, records verified balance deltas |
| `src/lib/market/index.ts` | Aggregated market snapshot (cached in `market_snapshots`), candles, recent trades |
| `src/lib/video/index.ts` | Mux direct uploads, webhook unwrap, status polling; local dev provider |
| `src/lib/storage/*` | Supabase Storage / local files; Pinata IPFS for token metadata; magic-byte sniffing |
| `src/lib/ai/assistant.ts` | Optional Claude suggestions with structured output + post-filters |

## Upload pipeline

`POST /api/uploads` (validates type/size/duration, SHA-256 duplicate check, rights confirmation) → creates a draft clip
and a one-time upload URL (Mux direct upload, or `/api/uploads/local/:id` in development) → browser PUTs the file with
progress → processing state comes from the Mux webhook (signature-verified) or status polling → `ready` → owner adds
details and publishes. Clips are never marked ready before the provider reports a playable asset.

## Real-time strategy

Polling with server-side caching instead of client RPC subscriptions: token pages refetch every 20 s, but the server
reuses snapshots younger than `MARKET_CACHE_SECONDS`, GeckoTerminal responses for 15–60 s and SOL/USD for 60 s, so
RPC load is bounded by the number of tokens, not viewers.

## Ranking formulas (`src/lib/trending.ts`)

- **Clip**: `(views24h + 4·likes24h + 3·shares24h + 2·warVotes24h + 10·ln(1+volume24hUsd)) / (ageHours+2)^1.3`
- **Token**: `ln(1+volume24hUsd) · (1 + 0.1·uniqueFragfunTraders24h) / √(ageDays+1)` — zero without verified volume
- **Creator**: `5·confirmedLaunches + 2·publishedClips + 3·ln(1+views) + 5·ln(1+likes)`

Views count once per visitor per hour, likes once per account, shares once per visitor per day, war votes once per
account per war — enforced by unique constraints.

## Clip Wars

Two published clips, a fixed end time, one free vote per signed-in user. No stakes, pools or payouts; votes are kept
in a separate table and never touch trading.
