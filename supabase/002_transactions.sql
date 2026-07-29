create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  merchant text,
  amount text not null,
  card_last4 text,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

-- No policies granted here on purpose. This table is only ever written by
-- the website's server-side API route (web/app/api/transactions/complete),
-- which uses the service role key and therefore bypasses RLS entirely.
-- Neither the browser's anon key nor the extension should ever read or
-- write this table directly.
