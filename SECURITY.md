# Security

Fragfun is treated as a financial application. **An independent security review is required before mainnet launch.**

## Wallet & transaction safety

- No seed phrases, private keys or recovery phrases are ever requested, transmitted or stored. The only key Fragfun
  creates is the ephemeral **mint keypair**, generated in the browser and discarded after co-signing.
- The server never signs for users. Admins have no ability to move user funds.
- Every prepared transaction passes `inspectPreparedTransaction`: fee payer = signed-in wallet; no address lookup
  tables (all accounts visible); top-level programs restricted to Compute Budget, System, SPL Token, Token-2022, ATA,
  Pump, PumpSwap, Pump fees; **no top-level SOL transfers**. Program IDs are constants, never client input.
- Every transaction is simulated before the user signs; the preview shows network + priority fee, total SOL cost
  (from simulated payer post-balance), and that Fragfun's fee is zero.
- Before broadcast, the signed message must be byte-identical to the prepared message hash and every required
  signature must verify. Submissions flip state atomically, so the same intent cannot be broadcast twice.
- Launch records become `confirmed` only after on-chain decoding of `create_v2` matches mint, creator and metadata.

## Company wallet

The company wallet's private key is never needed by Fragfun. A server-side signer exists only for optional fee
sponsorship (off by default). When used, the company may only be the fee payer: the guard rejects any instruction that
references it, the server co-signs only after verifying the user's signature on the identical message, and daily
limits cap exposure. Use a dedicated low-balance fee wallet, never the treasury. See COMPANY_WALLET.md.

## Authentication

Sign-In With Solana: server-issued nonce (16 random bytes, 5-minute expiry, single use, bound to wallet + exact
message), domain and network checks, ed25519 verification. Session = HS256 JWT in an HTTP-only, `SameSite=Lax`,
`Secure` (production) cookie; the wallet in the token is re-checked against the database on every request. Suspended
users are rejected. Admin = verified session wallet in `ADMIN_WALLETS` or `users.role = 'admin'`.

## Web protections

- CSRF: all mutating routes require an `Origin` matching the site (plus `SameSite=Lax` cookies).
- Input validation: zod on every route; Postgres check constraints as a second layer; parameterised SQL only.
- Output: React escaping; external links `rel="noreferrer nofollow"`; social links must be `https://`.
- Uploads: size/duration limits, type detected from magic bytes (video and image), SHA-256 must match the declared
  hash, images served with `nosniff`; SVG is rejected.
- Rate limits per IP/user on auth, uploads, launches, trades, engagement, search (in-memory per instance — add a shared
  store such as Upstash Redis when running many instances). DB unique constraints are the hard guarantee.
- Headers: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Webhooks: Mux signature verified with `MUX_WEBHOOK_SECRET`; cron endpoint requires `CRON_SECRET`.
- Secrets live only in server env vars; only `NEXT_PUBLIC_*` reaches the browser.

## Privacy

Views use a salted, daily-rotating hash of IP + user agent; raw IPs are not stored.

## AI assistant

Optional. Prompts forbid return promises and fake endorsements; clip details are passed as delimited data; outputs are
post-filtered for banned phrases and ticker format. Users can always enter details manually.

## Known gaps / pre-launch checklist

- [ ] External audit of transaction building, guard and verification code
- [ ] Shared rate limiting store for multi-instance deployments
- [ ] Content Security Policy (wallet adapters and Mux/HLS sources need careful allow-listing)
- [ ] Automated content moderation for uploads (currently report + admin queue; `AUTO_APPROVE_CLIPS=false` available)
- [ ] `npm audit` review — transitive advisories exist in wallet-adapter/react-native dependency chains
- [ ] Legal review of Terms / Privacy drafts and token-launch compliance in target jurisdictions
