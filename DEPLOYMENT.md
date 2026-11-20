# Deployment (Vercel + Supabase + Mux + Pinata)

Nothing has been deployed yet. These are the steps; each must be verified after it is done.

## 1. Supabase

1. Create a project. Copy the **Session pooler** connection string → `DATABASE_URL`.
2. Run migrations from your machine: `DATABASE_URL=... npm run db:migrate`.
3. Storage → create a **public** bucket `fragfun-public` → `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Enable Point-in-Time Recovery.

## 2. Mux

1. Access token with Mux Video read/write → `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`; set `VIDEO_PROVIDER=mux`.
2. Webhook → `https://YOUR_DOMAIN/api/webhooks/mux` (events `video.asset.*`) → `MUX_WEBHOOK_SECRET`.

## 3. Pinata

JWT with file write → `PINATA_JWT`, `METADATA_PROVIDER=pinata` (required on mainnet; enforced by config validation).

## 4. Solana RPC

Dedicated provider (e.g. Helius). Server key → `SOLANA_RPC_URL` (+ `SOLANA_RPC_FALLBACK_URLS`). A separate,
domain-restricted key → `NEXT_PUBLIC_SOLANA_RPC_URL`. Set both network variables to `mainnet-beta`.

## 4b. Company wallet

Set `COMPANY_WALLET_ADDRESS=HLdg6LmRZi6Xfe5WgGLRPCXpr6auR1uodt4D3GotkhF8` and add the same address to `ADMIN_WALLETS`. Leave `FEATURE_FEE_SPONSORSHIP=false`
unless you follow [COMPANY_WALLET.md](COMPANY_WALLET.md). Run `npm run verify:mainnet` against the production RPC.

## 5. Vercel

1. Import the repository; framework Next.js; Node 22.
2. Add every variable from `.env.example` (Production + Preview), including `SESSION_SECRET`
   (`openssl rand -base64 48`), `CRON_SECRET`, `ADMIN_WALLETS`, `APP_URL`/`NEXT_PUBLIC_APP_URL`.
3. `vercel.json` schedules `/api/cron/reconcile` every 5 minutes (Vercel sends `Authorization: Bearer $CRON_SECRET`).
4. Deploy, then verify: `/api/health` returns `ok: true`; sign in with Phantom and Solflare on the deployed domain;
   upload a clip and confirm the Mux webhook marks it ready; open a token page.

## 6. Custom domain

Vercel → Project → Domains → add `fragfun.xyz` (example) and `www`. Add the DNS records Vercel shows (A `76.76.21.21`
for apex or CNAME `cname.vercel-dns.com`). Then update `APP_URL`, `NEXT_PUBLIC_APP_URL`, the Mux webhook URL and the
Mux upload CORS origin (it uses `APP_URL`), and redeploy. Sign-in messages are bound to the host, so old sessions
become invalid — expected.

## 7. Monitoring

- **Uptime**: point an uptime monitor (Better Stack, UptimeRobot, Vercel checks) at `/api/health` (returns 503 when
  the database or RPC is down).
- **Errors**: server errors are logged to stdout (Vercel logs) and to `system_events` (admin dashboard). Add Sentry
  (`@sentry/nextjs`) for alerting before launch.
- **Launch reconciliation**: watch the admin "launches needing reconciliation" counter.

## Rollback

Vercel instant rollback for code. Database migrations are append-only; write a compensating migration rather than
editing applied files.
