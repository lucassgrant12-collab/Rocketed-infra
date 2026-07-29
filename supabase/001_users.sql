create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  wallet_address text not null unique,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "anon can insert onboarding rows"
  on public.users
  for insert
  to anon
  with check (true);

create policy "anon can update own row by wallet_address"
  on public.users
  for update
  to anon
  using (true)
  with check (true);

-- RLS policies alone aren't enough. A table created via raw SQL (as
-- opposed to Supabase's Table Editor UI) doesn't automatically grant the
-- anon role base table-level access, and without that grant, Postgres can
-- still reject an insert with "new row violates row-level security
-- policy" even though a correct, permissive RLS policy exists above.
grant usage on schema public to anon;
grant insert, update on public.users to anon;
