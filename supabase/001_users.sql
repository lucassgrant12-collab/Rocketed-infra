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
