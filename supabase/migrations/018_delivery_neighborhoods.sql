-- 018 · taxas de entrega por bairro

create table if not exists public.delivery_neighborhoods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  fee_cents integer not null default 0 check (fee_cents >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists delivery_neighborhoods_store_name_idx
  on public.delivery_neighborhoods (store_id, lower(trim(name)));

create index if not exists delivery_neighborhoods_store_idx
  on public.delivery_neighborhoods (store_id, name);

alter table public.delivery_neighborhoods enable row level security;

drop policy if exists "delivery_neighborhoods_read" on public.delivery_neighborhoods;
create policy "delivery_neighborhoods_read"
  on public.delivery_neighborhoods for select
  to anon, authenticated
  using (true);

grant select on public.delivery_neighborhoods
  to anon, authenticated;
