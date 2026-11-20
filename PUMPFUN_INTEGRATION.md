# Pump.fun integration

## Research summary (verified 2026-11-20)

| Question | Finding |
|---|---|
| Supported creation method | Direct on-chain instruction `create_v2` on the Pump program, built with the **official** SDK `@pump-fun/pump-sdk` **4.3.1** (published by `pump-fun`, repo `github.com/pump-fun/pump-sdk`, last published 2026-10-22). No private HTTP API is used. |
| Program IDs | Pump `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`, PumpSwap AMM `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`, Pump fees `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` — read from the SDK and hardcoded in `src/lib/solana/tx-guard.ts`. Client input can never change them. |
| Token standard | `create_v2` creates a **Token-2022** mint, quoted in SOL. Pump coins use 6 decimals. |
| Website-based launches | Supported: any client can build `create_v2` and have the user's wallet sign it. The user never visits pump.fun. |
| Metadata | `create_v2` takes `name`, `symbol`, `uri`. The URI points to Metaplex-style JSON (`name, symbol, description, image, showName, createdOn, twitter, telegram, website`). Fragfun pins image + JSON to IPFS via **Pinata** (production) or serves them from its own storage (development / devnet). pump.fun's own `/api/ipfs` upload endpoint is undocumented and is **not** used. |
| Creator attribution & fees | `create_v2(creator = user wallet)`. Creator fees accrue to the creator's Pump creator vault and are claimable by the creator; Fragfun does not intercept them and charges **no platform fee**. Pump protocol fees apply to trades. |
| Signing | Two signers: the user's wallet (fee payer, `user`) and the new **mint keypair**. Fragfun generates the mint keypair **in the browser**, uses it to co-sign, and discards it; it never reaches the server. |
| Verifying a launch | `getSignatureStatuses` → `getTransaction` → locate the Pump `create_v2` instruction (discriminator `d6904cec5f8b31b4`), check account 0 = mint, account 5 = user (from the IDL), decode Borsh args and compare `name`, `symbol`, `uri`, `creator` with the prepared launch. |
| Limitations | `create_v2 + buy_v2` (43 accounts) exceeds the 1232-byte transaction limit without a lookup table. Fragfun uses `createV2AndBuyInstructions` (`create_v2` + legacy `buy`, 16 accounts) for launches with an initial buy. Some recent mainnet transactions use a newer transaction version that `@solana/web3.js` v1 cannot decode — this does not affect Fragfun's own (v0) transactions. |
| Devnet | The Pump program exists on devnet and **accepts the same `create_v2` transaction** (verified by simulation). Devnet behaviour, fees and liquidity are not identical to mainnet; GeckoTerminal does not index devnet, so devnet market pages show on-chain price/market cap only. |

## Flows

### Launch (`src/lib/launch/service.ts`)

1. `POST /api/launches` — validate input (zod), confirm the clip belongs to the signed-in wallet and is processed,
   enforce one active launch per clip (DB partial unique index), check the browser-supplied mint pubkey does not exist,
   store the image + metadata, build the transaction with `buildLaunchTransaction`, run the **transaction guard**, and
   **simulate** it with the payer's post-state to compute the exact SOL cost. Persist token + attempt
   (`awaiting_signature`) with the message hash. Returns the unsigned transaction and a preview.
2. Browser: wallet `signTransaction` → mint keypair `sign` → `POST /api/launches/:id/submit`.
3. Server checks the signed message is **byte-identical** to the prepared one and every signature is valid, stores the
   signature (`submitted`) **before** broadcasting, then `sendRawTransaction` with preflight.
4. `GET /api/launches/:id` (polled) and the Vercel cron `/api/cron/reconcile` call `reconcileAttempt`, which applies
   the state machine in `src/lib/launch/state.ts`:
   - confirmed + verified → `confirmed` (token page goes live, notification sent)
   - on-chain error / verification mismatch → `failed`
   - not found **and** the blockhash has provably expired → `failed` (`blockhash_expired`)
   - RPC trouble / timeouts → `unknown` (never `failed`); re-broadcasts the identical signed bytes (idempotent)
5. Abandoned attempts (never submitted) are expired only after their blockhash expired **and** the mint account does
   not exist on-chain; otherwise they are flagged `unknown` for admin review.

### Trading (`src/lib/trade/service.ts`, `buildTradeTransaction`)

- Venue detection from chain state: bonding curve not complete → `buy_v2` / `sell_v2` (`buyV2Instructions`,
  `sellV2Instructions`) with the mint's real token program; complete and canonical PumpSwap pool exists →
  `PUMP_AMM_SDK.buyQuoteInput` / `sellBaseInput`; complete but pool missing → trading disabled with an explanation.
- Quotes use the SDK's pricing functions with live `Global`, `FeeConfig` and curve/pool state. Slippage is applied to
  the on-chain limit (`max_sol_cost` / `min_sol_output`).
- Same guard → sign → identical-bytes check → broadcast → reconcile pattern as launches; a trade intent can only be
  submitted once (atomic status flip).
- Only tokens launched (and verified) through Fragfun can be traded in the app.

## Verification evidence (all read-only — nothing was broadcast)

`npm run verify:pump` (mainnet, `https://api.mainnet-beta.solana.com`, simulated payer = a funded public wallet,
`sigVerify: false`, no signatures produced):

```
[launch] programs: ComputeBudget, Pump, ATA, Pump   guard: OK   signers required: 2
[launch] simulation err: null | units: 203322        create_v2 log present: true
[market] {"mint":"61Xh…pump","lifecycle":"bonding_curve","tokenProgram":"Tokenz…(Token-2022)","marketCapSol":33.96,"curveProgress":0.1254,…}
[buy] quote: {"venue":"bonding_curve","inputAmount":"10000000","expectedOutput":"290708396146","limitAmount":"10500000",…}
[buy] programs: ComputeBudget, ATA, Pump | guard: OK
[buy] simulation err: null | units: 106860
```

Devnet (same script with `SOLANA_RPC_URL=https://api.devnet.solana.com` and a funded devnet payer):
`[launch] simulation err: null | units: 197369 · create_v2 log present: true`.

Additionally, the API integration test calls `POST /api/launches` with an unfunded wallet against devnet and gets the
honest `simulation_failed` / "no SOL" response — the full prepare path (metadata, build, guard, simulation) runs.

## Not yet verified — requires your action

1. **Real devnet launch through the UI** — fund the E2E test wallet `.data/test-wallet.json`
   (`npm run wallet:test` prints the address) with ~1 devnet SOL from https://faucet.solana.com (CAPTCHA, so it must be
   done by a person), then `npm run test:e2e`. The E2E test then signs, broadcasts, waits for on-chain verification,
   opens the token page and requests a trade quote.
2. **Mainnet acceptance test** — needs your explicit approval, a dedicated wallet with a small amount of SOL, Pinata
   credentials and a dedicated RPC. Procedure in [TESTING.md](TESTING.md#mainnet-acceptance-test).
3. **Sell and PumpSwap (post-migration) paths** — implemented against the SDK, not yet simulated. They will be
   exercised during the acceptance test (sell) and when a Fragfun token graduates (PumpSwap).
