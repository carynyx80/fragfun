# Testing

| Suite | Command | Count | Scope |
|---|---|---|---|
| Unit | `npm test` | 49 | SIWS message/signature checks, company wallet address/signer/config validation, sponsored-transaction guard and co-signing, launch state machine, form/upload/trade validation, amount math, magic-byte sniffing, ranking formulas, AI guardrails, rate limiter, transaction guard (with SDK-built `create_v2`), `create_v2` decoding, curve math |
| Integration — DB | `npm run test:integration` | 10 | Real schema on in-memory PGlite: one active launch per clip, unique mints, ticker checks, duplicate uploads, idempotent engagement, war votes, idempotency keys, RLS enabled everywhere |
| Integration — API | `npm run test:integration` | 9 | Against a running server with real ed25519 test wallets: auth + replay/forgery/CSRF rejection, auth requirements, upload → ready → publish → feed → range streaming, duplicate/mismatch rejection, view/like dedupe, launch preparation (validation, ownership, external image refusal, on-chain simulation on devnet), trading restricted to Fragfun tokens, reports/wars/search |
| E2E | `npm run test:e2e` | 19 | Chromium desktop + Pixel 7: homepage + navigation, every public page, error states, connect + sign in with a test wallet, upload a **browser-generated original clip**, processing, details, token form, preview, launch preparation, profile update, explore feed, mobile overflow + tab bar |

Last run (2026-11-20): **all 87 passing** (49 + 19 + 19). Integration/E2E run against a devnet-mode server (they create launches with throwaway wallets); the local `.env.local` is now mainnet.

`npm run verify:mainnet` — read-only mainnet checks of the company wallet integration (9 checks, all passing).

## Mocks and test doubles (clearly identified)

- **Test wallet** (`tests/e2e/test-wallet.ts`): a Wallet Standard wallet registered only inside Playwright pages,
  signing in the Node test process with a devnet keypair. Never shipped in the app.
- **Synthetic upload bytes** in API tests: an MP4 container header + filler, used to test the upload pipeline. The
  browser E2E test uploads a real WebM generated with canvas + MediaRecorder.
- No blockchain responses are mocked: launch preparation simulates against real devnet; `npm run verify:pump`
  simulates against real mainnet.

## Real devnet launch (pending: needs funded test wallet)

1. `npm run wallet:test` — prints the test wallet address (stored in `.data/test-wallet.json`).
2. Fund it with 1 devnet SOL at https://faucet.solana.com.
3. `npm run test:e2e` — `launch-flow.spec.ts` detects the balance and runs the full launch: sign → broadcast →
   on-chain verification → success screen → market page → trade quote.

## Mainnet acceptance test

Requires **explicit owner approval** before any step that spends SOL.

1. Configure production-like env: `SOLANA_NETWORK=mainnet-beta`, dedicated RPC, `METADATA_PROVIDER=pinata` + JWT,
   Supabase, Mux.
2. Use a dedicated wallet holding ≈0.1 SOL. Launch a test clip with **no initial buy**.
3. Record: launch signature, mint, Solscan link; confirm the coin appears on pump.fun; confirm metadata (name,
   ticker, image, description) matches; confirm Fragfun shows the token as confirmed and the DB row matches chain.
4. Buy 0.005 SOL, then sell the received amount. Record both signatures and verified deltas in `trade_intents`.
5. Paste the signatures into this file under "Acceptance results".

### Acceptance results

_Not yet executed._
