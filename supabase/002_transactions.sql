create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  -- Nullable on purpose: the extension can be used without ever going
  -- through website onboarding (no wallet-bridge sync happened), in which
  -- case the paying wallet is genuinely unknown. The transaction still
  -- gets recorded; only the confirmation email gets skipped for it.
  wallet_address text,
  merchant text,
  amount text not null,
  card_last4 text,
  created_at timestamptz not null default now()
);

-- Covers a project where this table was already created with the older
-- (wallet_address text not null) shape: safe to run even if the column
-- was already nullable.
alter table public.transactions alter column wallet_address drop not null;

alter table public.transactions enable row level security;

-- No policies granted here on purpose. This table is only ever written by
-- the website's server-side API route (web/app/api/transactions/complete),
-- which uses the service role key and therefore bypasses RLS entirely.
-- Neither the browser's anon key nor the extension should ever read or
-- write this table directly.
