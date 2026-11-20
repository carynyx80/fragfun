-- Fragfun initial schema.
-- Runs on Supabase Postgres (production) and on embedded PGlite (local development / tests).
-- All application access goes through the server (service connection). Row Level Security is
-- enabled on every table as defence in depth: the anon / authenticated Supabase roles can only
-- read published, approved content, and can never write.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- users & profiles
create table users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique check (length(wallet_address) between 32 and 44),
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table creator_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  username text unique check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text check (length(display_name) <= 48),
  avatar_url text check (length(avatar_url) <= 512),
  bio text check (length(bio) <= 280),
  twitter text check (length(twitter) <= 64),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index creator_profiles_username_trgm on creator_profiles using gin (username gin_trgm_ops);

-- ---------------------------------------------------------------- auth
create table auth_nonces (
  nonce text primary key,
  wallet_address text not null,
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_nonces_expires on auth_nonces (expires_at);

-- ---------------------------------------------------------------- categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  game text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into categories (slug, name, game, sort_order) values
  ('gta-6', 'GTA 6', 'Grand Theft Auto VI', 1),
  ('funny-moments', 'Funny Moments', null, 2),
  ('crazy-stunts', 'Crazy Stunts', null, 3),
  ('speedruns', 'Speedruns', null, 4),
  ('gameplay-highlights', 'Gameplay Highlights', null, 5),
  ('community-favorites', 'Community Favorites', null, 6);

-- ---------------------------------------------------------------- clips
create table clips (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references users(id) on delete cascade,
  title text not null default '' check (length(title) <= 80),
  description text not null default '' check (length(description) <= 500),
  category_id uuid references categories(id) on delete set null,
  video_provider text not null check (video_provider in ('mux', 'local')),
  video_upload_id text,
  video_asset_id text,
  playback_id text,
  thumbnail_url text,
  duration_seconds numeric(8, 2),
  content_hash text check (content_hash ~ '^[a-f0-9]{64}$'),
  file_size_bytes bigint,
  mime_type text,
  processing_status text not null default 'awaiting_upload'
    check (processing_status in ('awaiting_upload', 'uploading', 'processing', 'ready', 'failed')),
  processing_error text,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'approved', 'rejected', 'removed')),
  rights_confirmed_at timestamptz,
  is_draft boolean not null default true,
  published_at timestamptz,
  view_count bigint not null default 0,
  like_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clips_creator on clips (creator_id, created_at desc);
create index clips_feed on clips (published_at desc) where is_draft = false and moderation_status = 'approved';
create index clips_category on clips (category_id, published_at desc);
create index clips_title_trgm on clips using gin (title gin_trgm_ops);
create unique index clips_upload_id on clips (video_upload_id) where video_upload_id is not null;
-- Duplicate detection: the same file cannot be live twice.
create unique index clips_content_hash_live on clips (content_hash)
  where content_hash is not null and moderation_status not in ('rejected', 'removed') and processing_status <> 'failed';

-- ---------------------------------------------------------------- tokens
create table tokens (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references clips(id) on delete restrict,
  creator_id uuid not null references users(id) on delete restrict,
  mint_address text not null unique,
  name text not null check (length(name) between 1 and 32),
  symbol text not null check (symbol ~ '^[A-Z0-9]{1,10}$'),
  description text not null default '' check (length(description) <= 500),
  image_url text not null,
  metadata_uri text not null,
  twitter text,
  telegram text,
  website text,
  launch_signature text unique,
  launch_status text not null default 'preparing'
    check (launch_status in ('preparing', 'awaiting_signature', 'submitted', 'confirming', 'confirmed', 'failed', 'unknown')),
  token_program text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
-- A clip can have at most one launch that is in flight or confirmed (failed attempts may be retried).
-- This prevents two real tokens being created for the same clip by concurrent launches.
create unique index tokens_one_active_per_clip on tokens (clip_id) where launch_status <> 'failed';
create index tokens_creator on tokens (creator_id, created_at desc);
create index tokens_confirmed on tokens (confirmed_at desc) where launch_status = 'confirmed';
create index tokens_name_trgm on tokens using gin (name gin_trgm_ops);
create index tokens_symbol on tokens (symbol);

create table token_launch_attempts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references users(id) on delete cascade,
  token_id uuid not null references tokens(id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'preparing'
    check (status in ('draft', 'preparing', 'awaiting_signature', 'submitted', 'confirming', 'confirmed', 'failed', 'unknown')),
  message_hash text,
  unsigned_tx_base64 text,
  signed_tx_base64 text,               -- kept so the identical transaction can be re-broadcast (idempotent)
  recent_blockhash text,
  last_valid_block_height bigint,
  transaction_signature text unique,
  dev_buy_lamports bigint not null default 0,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, idempotency_key)
);
create index launch_attempts_open on token_launch_attempts (status, updated_at)
  where status in ('submitted', 'confirming', 'unknown');

-- ---------------------------------------------------------------- trades executed through Fragfun
create table trade_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_id uuid not null references tokens(id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  venue text not null check (venue in ('bonding_curve', 'pump_amm')),
  input_amount numeric(40, 0) not null,
  expected_output numeric(40, 0) not null,
  limit_amount numeric(40, 0) not null,
  slippage_bps int not null,
  message_hash text not null,
  recent_blockhash text not null,
  last_valid_block_height bigint not null,
  transaction_signature text unique,
  signed_tx_base64 text,
  status text not null default 'prepared'
    check (status in ('prepared', 'submitted', 'confirmed', 'failed', 'expired', 'unknown')),
  error_message text,
  sol_delta_lamports numeric(40, 0),
  token_delta numeric(40, 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trade_intents_user on trade_intents (user_id, created_at desc);
create index trade_intents_token on trade_intents (token_id, created_at desc) where status = 'confirmed';

-- ---------------------------------------------------------------- engagement
create table clip_engagement (
  id bigint generated always as identity primary key,
  clip_id uuid not null references clips(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  visitor_key text not null,           -- user id, or salted hash of ip+ua (never raw IP)
  engagement_type text not null check (engagement_type in ('view', 'like', 'share')),
  bucket text not null,                -- dedupe window (e.g. hour for views), 'once' for likes
  created_at timestamptz not null default now(),
  unique (clip_id, visitor_key, engagement_type, bucket)
);
create index clip_engagement_recent on clip_engagement (clip_id, engagement_type, created_at desc);

-- ---------------------------------------------------------------- clip wars (social only, no wagering)
create table clip_wars (
  id uuid primary key default gen_random_uuid(),
  clip_a_id uuid not null references clips(id) on delete cascade,
  clip_b_id uuid not null references clips(id) on delete cascade,
  created_by uuid not null references users(id) on delete cascade,
  title text check (length(title) <= 80),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'ended', 'removed')),
  created_at timestamptz not null default now(),
  check (clip_a_id <> clip_b_id),
  check (ends_at > starts_at)
);
create index clip_wars_active on clip_wars (status, ends_at);

create table clip_war_votes (
  war_id uuid not null references clip_wars(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  clip_id uuid not null references clips(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (war_id, user_id)
);

-- ---------------------------------------------------------------- reports & moderation
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users(id) on delete cascade,
  target_type text not null check (target_type in ('clip', 'profile', 'token')),
  target_id text not null,
  reason text not null check (reason in ('copyright', 'spam', 'scam', 'harassment', 'nsfw', 'violence', 'other')),
  details text check (length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolved_by uuid references users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_open on reports (status, created_at desc);

-- ---------------------------------------------------------------- market data cache
create table market_snapshots (
  id bigint generated always as identity primary key,
  mint_address text not null,
  source text not null,                -- e.g. 'solana-rpc:bonding-curve', 'geckoterminal'
  price_sol numeric(38, 18),
  price_usd numeric(38, 18),
  market_cap_sol numeric(38, 9),
  market_cap_usd numeric(38, 4),
  volume_24h_usd numeric(38, 4),
  liquidity_usd numeric(38, 4),
  curve_progress numeric(7, 4),
  lifecycle text check (lifecycle in ('bonding_curve', 'migrated', 'unknown')),
  raw jsonb,
  captured_at timestamptz not null default now()
);
create index market_snapshots_mint on market_snapshots (mint_address, captured_at desc);

-- ---------------------------------------------------------------- notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('upload_ready', 'upload_failed', 'launch_confirmed', 'launch_failed', 'trade_confirmed', 'trade_failed')),
  title text not null,
  body text,
  href text,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- admin audit
create table admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid not null references users(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_recent on admin_audit_logs (created_at desc);

-- ---------------------------------------------------------------- app error log (for admin health view)
create table system_events (
  id bigint generated always as identity primary key,
  level text not null check (level in ('info', 'warn', 'error')),
  source text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index system_events_recent on system_events (level, created_at desc);

-- ---------------------------------------------------------------- Row Level Security
alter table users enable row level security;
alter table creator_profiles enable row level security;
alter table auth_nonces enable row level security;
alter table categories enable row level security;
alter table clips enable row level security;
alter table tokens enable row level security;
alter table token_launch_attempts enable row level security;
alter table trade_intents enable row level security;
alter table clip_engagement enable row level security;
alter table clip_wars enable row level security;
alter table clip_war_votes enable row level security;
alter table reports enable row level security;
alter table market_snapshots enable row level security;
alter table notifications enable row level security;
alter table admin_audit_logs enable row level security;
alter table system_events enable row level security;

-- Public read policies are only created where the Supabase API roles exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute $p$create policy public_read_categories on categories for select to anon, authenticated using (is_active)$p$;
    execute $p$create policy public_read_clips on clips for select to anon, authenticated
      using (is_draft = false and moderation_status = 'approved')$p$;
    execute $p$create policy public_read_tokens on tokens for select to anon, authenticated
      using (launch_status = 'confirmed')$p$;
    execute $p$create policy public_read_profiles on creator_profiles for select to anon, authenticated using (true)$p$;
  end if;
end
$$;
