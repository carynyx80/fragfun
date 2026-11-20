# Fragfun

**Clip it. Tokenize it. Trade it.** — a gaming-native launchpad on Solana. Creators upload gaming clips, launch a
token for each clip through Pump.fun's on-chain programs (directly from Fragfun, signed in their own wallet), and
everyone can discover, watch and trade them.

> Fragfun is independent and not affiliated with Rockstar Games, Take-Two Interactive or Pump.fun.

## Status at a glance

| Area | State |
|---|---|
| Clip upload, processing, feed, discovery, search | Working locally (local video provider); Mux integration implemented, needs credentials |
| Wallet auth (Phantom / Solflare, Sign-In With Solana) | Working, tested with real ed25519 signatures |
| Launch engine (`create_v2` via official `@pump-fun/pump-sdk` 4.3.1) | Transactions build, pass the guard and **simulate successfully on mainnet and devnet**. A real broadcast launch has **not** been executed yet (needs a funded test wallet — see below) |
| On-chain launch verification + reconciliation | Implemented and unit-tested; not yet exercised against a real launch signature |
| Trading (bonding curve buy/sell, PumpSwap after migration) | Bonding-curve buy **simulates successfully on mainnet** against a live token; sell and PumpSwap paths implemented, not yet simulated |
| Market data (RPC + GeckoTerminal + CoinGecko) | Working against live mainnet data |
| Profiles, leaderboard, Clip Wars, reports, admin, notifications | Working locally |
| Company wallet | `HLdg6LmR…khF8` configured as treasury on mainnet; balance tracking live; fee sponsorship implemented, **off** |
| Tests | 49 unit · 19 integration · 19 Playwright (desktop + mobile) — all passing |

See **[PUMPFUN_INTEGRATION.md](PUMPFUN_INTEGRATION.md)** for exactly what was verified and what still needs a real transaction.

## Quick start (no accounts needed)

```bash
npm install
cp .env.example .env.local   # defaults: mainnet-beta, embedded database; set SOLANA_*=devnet for free testing
npm run dev
```

Open http://localhost:3000. The embedded Postgres (PGlite) database is created and migrated automatically in
`.data/pglite`, and uploaded clips are stored in `.data/` (development only).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` / `npm run lint` | TypeScript strict / ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:integration` | DB constraint tests + HTTP API tests (needs `npm run dev` running) |
| `npm run test:e2e` | Playwright, desktop + mobile (starts/reuses the dev server) |
| `npm run db:migrate` | Apply `supabase/migrations` to `DATABASE_URL` (or the local PGlite DB) |
| `npm run verify:mainnet` | **Read-only** mainnet check of the company wallet, cluster and sponsored-launch path |
| `npm run verify:pump` | **Read-only** mainnet check: builds + simulates a launch and a buy, sends nothing |
| `npm run wallet:test` | Show the devnet test wallet used by E2E tests (`.data/test-wallet.json`) |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, flows, ranking formulas
- [DATABASE.md](DATABASE.md) — schema, constraints, RLS
- [PUMPFUN_INTEGRATION.md](PUMPFUN_INTEGRATION.md) — launch & trade integration, verification evidence
- [COMPANY_WALLET.md](COMPANY_WALLET.md) — official company wallet, treasury tracking, optional fee sponsorship
- [SECURITY.md](SECURITY.md) — threat model and controls
- [TESTING.md](TESTING.md) — test suites and how to run the real-launch acceptance test
- [DEPLOYMENT.md](DEPLOYMENT.md) — Vercel + Supabase + Mux + Pinata setup, domains, monitoring
- [.env.example](.env.example) — every environment variable, where to get it

## Troubleshooting

- **429 Too Many Requests from Solana** — the public RPC endpoints are heavily rate limited. Set `SOLANA_RPC_URL`
  (and `NEXT_PUBLIC_SOLANA_RPC_URL`) to a dedicated provider such as Helius.
- **"Your wallet has no SOL on this network"** — on devnet, get test SOL from https://faucet.solana.com (the RPC
  airdrop endpoint is closed).
- **Schema changed during development** — stop the dev server and delete `.data/pglite` to recreate it.
- **Uploads fail with "Video uploads are unavailable"** — `VIDEO_PROVIDER=mux` without Mux credentials.
