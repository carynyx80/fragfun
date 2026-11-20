-- Company wallet integration: record who paid the network fee for each prepared transaction,
-- so sponsored (company-paid) transactions can be rate-limited and audited.
alter table token_launch_attempts add column if not exists fee_payer text;
alter table trade_intents add column if not exists fee_payer text;
create index if not exists launch_attempts_fee_payer on token_launch_attempts (fee_payer, created_at desc) where fee_payer is not null;
create index if not exists trade_intents_fee_payer on trade_intents (fee_payer, created_at desc) where fee_payer is not null;
