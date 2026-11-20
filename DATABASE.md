# Database

Schema: `supabase/migrations/0001_init.sql`. Applied with `npm run db:migrate` (tracked in `schema_migrations`;
each file runs in a transaction; re-running is a no-op). The same SQL runs on Supabase Postgres and on embedded PGlite.

## Tables

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | One row per wallet | `wallet_address` unique; `role`, `status` (active/suspended) |
| `creator_profiles` | Username, display name, avatar, bio, settings | username unique, `^[a-zA-Z0-9_]{3,24}$` |
| `auth_nonces` | Single-use sign-in nonces with expiry | consumed atomically with `used_at` |
| `categories` | Admin-managed games/categories (GTA 6 seeded) | slug unique |
| `clips` | Video asset refs, processing + moderation state, counters | live `content_hash` unique (ignores failed/removed); upload id unique |
| `tokens` | Launched (or in-flight) tokens linked to a clip | `mint_address` unique, `launch_signature` unique, **one non-failed token per clip**, ticker check |
| `token_launch_attempts` | Each prepare/sign/submit cycle | `(creator_id, idempotency_key)` unique, signature unique |
| `trade_intents` | Prepared/submitted trades through Fragfun + verified deltas | signature unique |
| `clip_engagement` | Views / likes / shares | `(clip, visitor_key, type, bucket)` unique → idempotent |
| `clip_wars`, `clip_war_votes` | Social face-offs | no self-wars; one vote per user per war |
| `reports` | User reports incl. copyright | one report per reporter per target |
| `market_snapshots` | Time-stamped market data with sources | pruned after 7 days |
| `notifications` | In-app notifications | `dedupe_key` unique |
| `admin_audit_logs` | Every privileged action | written in the same transaction as the action |
| `system_events` | Warnings/errors for the admin health view | — |

## Row Level Security

RLS is **enabled on every table**. The application connects with the database owner role from the server only. When
the Supabase `anon`/`authenticated` roles exist, the migration adds read-only policies for published, approved clips,
confirmed tokens, categories and profiles; there are no write policies, so the public API key cannot modify data.

## Cascades

User deletion cascades to profiles, engagement, votes and notifications; `tokens.clip_id` / `creator_id` are
`restrict` so an on-chain token's record can never be silently deleted. Clips with a non-failed token cannot be deleted
through the API (they can be hidden by moderation).

## Production notes

- Use the Supabase **session pooler** connection string (`prepare: false` is set for pooler compatibility).
- Back up with Supabase PITR. Migrations are append-only: add `0002_*.sql` for changes.
