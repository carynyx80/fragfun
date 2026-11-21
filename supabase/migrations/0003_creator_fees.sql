-- Creator fees: per-token Pump fee-sharing split (creator / Fragfun) and claim transactions.
alter table tokens add column if not exists fee_share_status text not null default 'not_applicable'
  check (fee_share_status in ('not_applicable', 'pending', 'submitted', 'configured', 'failed'));
alter table tokens add column if not exists fee_share_platform_bps int;
alter table tokens add column if not exists fee_share_signature text;

-- Generic server-prepared transactions that a user signs (fee-share setup, fee claims).
create table if not exists prepared_txs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_id uuid references tokens(id) on delete cascade,
  kind text not null check (kind in ('fee_share', 'claim')),
  message_hash text not null,
  last_valid_block_height bigint not null,
  signed_tx_base64 text,
  transaction_signature text unique,
  status text not null default 'prepared' check (status in ('prepared', 'signed', 'submitted', 'confirmed', 'failed', 'expired', 'unknown')),
  error_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prepared_txs_user on prepared_txs (user_id, created_at desc);
create index if not exists prepared_txs_token on prepared_txs (token_id, kind, created_at desc);
alter table prepared_txs enable row level security;
