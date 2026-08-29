-- 026 · tamanhos globais do cardápio (pizzas)

create table if not exists public.sizes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null default 0 check (price >= 0),
  max_select integer not null default 1 check (max_select >= 1 and max_select <= 10),
  price_mode text not null default 'replace' check (price_mode in ('replace', 'addon')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists sizes_store_idx
  on public.sizes (store_id, sort_order, name);

alter table public.sizes enable row level security;

drop policy if exists "sizes_read" on public.sizes;
create policy "sizes_read"
  on public.sizes for select
  to anon, authenticated
  using (true);

grant select on public.sizes to anon, authenticated;

insert into public.sizes (store_id, name, price, max_select, price_mode, sort_order, active)
select s.id, v.name, v.price, v.max_select, 'replace', v.sort_order, true
from public.stores s
cross join (
  values
    ('P - Pequena', 35.00, 1, 0),
    ('M - Média', 45.00, 1, 1),
    ('G - Grande', 55.00, 2, 2),
    ('F - Família', 75.00, 2, 3)
) as v(name, price, max_select, sort_order)
where not exists (
  select 1 from public.sizes z where z.store_id = s.id
);
