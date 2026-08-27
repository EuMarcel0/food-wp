-- 025 · bordas globais e flag no item do cardápio

alter table public.products
  add column if not exists crusts_enabled boolean not null default false;

create table if not exists public.crusts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  adds_price boolean not null default false,
  price numeric(12, 2) not null default 0 check (price >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists crusts_store_idx
  on public.crusts (store_id, sort_order, name);

alter table public.crusts enable row level security;

drop policy if exists "crusts_read" on public.crusts;
create policy "crusts_read"
  on public.crusts for select
  to anon, authenticated
  using (true);

grant select on public.crusts to anon, authenticated;

insert into public.crusts (store_id, name, adds_price, price, sort_order, active)
select s.id, v.name, false, 0, v.sort_order, true
from public.stores s
cross join (
  values
    ('Sem Borda', 0),
    ('Borda de cheddar', 1),
    ('Borda de Catupiry', 2)
) as v(name, sort_order)
where not exists (
  select 1 from public.crusts c where c.store_id = s.id
);
