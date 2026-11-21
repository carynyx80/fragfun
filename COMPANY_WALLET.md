# Company wallet (treasury & operations)

**Official Fragfun company wallet (Solana mainnet-beta):** `HLdg6LmRZi6Xfe5WgGLRPCXpr6auR1uodt4D3GotkhF8`

No custom smart contract is involved. The wallet is an ordinary system-owned Solana account used with the existing
System, Token and Pump.fun programs.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `COMPANY_WALLET_ADDRESS` | server env (public value) | Treasury address: balance tracking, `/api/platform`, optional fee payer |
| `COMPANY_SIGNER_SECRET_KEY` | server env, **secret**, optional | Only for fee sponsorship. Not configured. |
| `FEATURE_FEE_SPONSORSHIP` | server env | `false` (default). Company pays users' network fees only when `true` |
| `SPONSOR_MAX_FEE_LAMPORTS_PER_TX`, `SPONSOR_MAX_TX_PER_DAY`, `SPONSOR_MAX_TX_PER_USER_PER_DAY` | server env | Sponsorship limits |

Startup validation rejects a malformed address, and refuses `FEATURE_FEE_SPONSORSHIP=true` without a signer. The
signer is only accepted if its public key equals `COMPANY_WALLET_ADDRESS`; error messages never include key material.

## What the integration does

- **Treasury tracking** — `/admin` → "Company treasury": live mainnet balance, recent transactions (Solscan links),
  RPC cluster verification (genesis hash), signer status and sponsorship status. API: `GET /api/admin/treasury`
  (admin only, read-only RPC, cached 30 s).
- **Receiving revenue (creator-fee split, approved 2026-11-21: 10%)** — Fragfun charges no fee on launches or trades.
  For new launches, the creator signs a second transaction (in the same wallet prompt when the wallet supports
  `signAllTransactions`) that sets the coin's Pump.fun fee-sharing split: **90% creator / 10% company wallet**
  (`PLATFORM_CREATOR_FEE_BPS=1000`). It runs `sweep_creator_fee` → `create_fee_sharing_config` → `update_fee_shares`,
  is sent right after the launch is verified, and is locked on-chain afterwards. The company wallet is only named in
  the split data; it never signs and is never debited. Payouts happen when anyone distributes the coin's fees (creators
  use the Claim button in their dashboard), which pays both shareholders in one transaction.
  - Not enforceable without a custom program: a creator can decline the second signature. The token then shows
    "Split not active" in their dashboard with an Activate button; `tokens.fee_share_status` tracks it.
  - Tokens launched before this change keep 100% of creator fees (`not_applicable`) and claim from their creator vault.
- **Optional fee payer** — when sponsorship is enabled, launch and trade transactions use the company wallet as the
  Solana fee payer:
  - the transaction guard requires the company to be the fee payer **only**: it may not appear in any instruction, so
    its SOL cannot fund rent, token buys or transfers; the user remains a required signer and the on-chain creator;
  - the server adds the company signature only **after** verifying the user's signature on the byte-identical prepared
    message, then verifies every signature before broadcasting;
  - per-transaction, global daily and per-user daily limits apply; beyond them users pay their own fee as before;
  - each attempt records `fee_payer` (migration `0002_company_wallet.sql`) for limits and audit;
  - the launch preview labels the fee "paid by Fragfun".
- **Health** — `/api/health` fails if the RPC serves a different cluster than `SOLANA_NETWORK`, or if a configured
  signer is invalid.
- **Mainnet safeguard** — launches on mainnet are refused unless `METADATA_PROVIDER=pinata`, so no mainnet token can
  point at metadata hosted on a dev machine.

## Verification (2026-11-20, nothing sent, no SOL spent)

`npx tsx scripts/verify-mainnet.ts`:

```
PASS  RPC serves Solana mainnet-beta  — 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d
PASS  Company address is a valid on-curve wallet
PASS  Company wallet exists and is system-owned        balance: 0.050330 SOL
PASS  Pump program deployed and executable
PASS  Pump Global state decodes
PASS  Launch as company wallet passes guard
PASS  Launch as company wallet simulates on mainnet  — simulated cost=0.005537 SOL
PASS  Sponsored launch passes guard (company = fee payer only)
PASS  Sponsored launch simulates; company pays exactly the network fee  — 15000 lamports (expected 15000)
All checks passed. No transactions were sent.
```

The running app also returned (mainnet config): `/api/health` ok with mainnet cluster verified; `/api/admin/treasury`
balance 0.0503 SOL and 9 recent transactions; non-admin access 403; mainnet launch refused with
`metadata_storage_required` until Pinata is configured.

## If you enable fee sponsorship

1. **Use a separate hot wallet for fees, not the treasury.** Its key must sit on the server, so anyone who compromises
   the server can spend it. Keep a small balance (e.g. 0.1–0.5 SOL) and top it up from the treasury by hand. To do
   this, set `COMPANY_WALLET_ADDRESS` to the fee wallet. The treasury address can still be tracked by setting it on a
   separate deployment, or ask for a dedicated `TREASURY_WALLET_ADDRESS` variable.
2. Export its 64-byte secret key and store it **only** as an encrypted Vercel environment variable (or a secrets
   manager) named `COMPANY_SIGNER_SECRET_KEY`. Never commit it, never prefix it with `NEXT_PUBLIC_`, never paste it
   into chats or tickets.
3. Set `FEATURE_FEE_SPONSORSHIP=true`, redeploy, and confirm `/admin` shows "Server signer: ok · Fee sponsorship: ON".
4. Watch the balance in `/admin`; lower the daily limits if it drains faster than expected.

The treasury wallet's own key should stay offline (hardware wallet). Nothing in Fragfun needs it.
