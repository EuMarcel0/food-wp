-- 012 · itens montáveis: grupos e opções (tamanho, sabores, borda, etc.)

alter table public.products
  add column if not exists customizable boolean not null default false;

create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  required boolean not null default true,
  min_select integer not null default 1 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= 1),
  price_mode text not null default 'addon' check (price_mode in ('addon', 'replace')),
  sort_order integer not null default 0,
  check (min_select <= max_select)
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  extra_price numeric(12, 2) not null default 0 check (extra_price >= 0),
  sort_order integer not null default 0,
  active boolean not null default true
);

create index if not exists product_option_groups_product_idx
  on public.product_option_groups (product_id, sort_order);

create index if not exists product_options_group_idx
  on public.product_options (group_id, sort_order);

alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;

drop policy if exists "product_option_groups_read" on public.product_option_groups;
create policy "product_option_groups_read"
  on public.product_option_groups for select
  to anon, authenticated
  using (true);

drop policy if exists "product_options_read" on public.product_options;
create policy "product_options_read"
  on public.product_options for select
  to anon, authenticated
  using (true);

grant select on public.product_option_groups, public.product_options
  to anon, authenticated;
