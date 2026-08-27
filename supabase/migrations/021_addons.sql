-- 021 · adicionais globais e vínculo com itens do cardápio

alter table public.products
  add column if not exists addons_enabled boolean not null default false;

create table if not exists public.addons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists addons_store_idx
  on public.addons (store_id, sort_order, name);

create table if not exists public.product_addons (
  product_id uuid not null references public.products(id) on delete cascade,
  addon_id uuid not null references public.addons(id) on delete cascade,
  primary key (product_id, addon_id)
);

create index if not exists product_addons_addon_idx
  on public.product_addons (addon_id);

alter table public.addons enable row level security;
alter table public.product_addons enable row level security;

drop policy if exists "addons_read" on public.addons;
create policy "addons_read"
  on public.addons for select
  to anon, authenticated
  using (true);

drop policy if exists "product_addons_read" on public.product_addons;
create policy "product_addons_read"
  on public.product_addons for select
  to anon, authenticated
  using (true);

grant select on public.addons to anon, authenticated;
grant select on public.product_addons to anon, authenticated;
