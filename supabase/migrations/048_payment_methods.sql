-- 048 · formas de pagamento cadastráveis por loja

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  kind text not null
    check (kind in ('pix', 'cash', 'credit', 'debit', 'other')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists payment_methods_store_idx
  on public.payment_methods (store_id, sort_order, name);

alter table public.payment_methods enable row level security;

drop policy if exists "payment_methods_read" on public.payment_methods;
create policy "payment_methods_read"
  on public.payment_methods for select
  to anon, authenticated
  using (true);

grant select on public.payment_methods to anon, authenticated;

insert into public.payment_methods (store_id, name, kind, sort_order, active)
select s.id, v.name, v.kind, v.sort_order, true
from public.stores s
cross join (
  values
    ('Pix na Entrega/Retirada', 'pix', 0),
    ('Dinheiro', 'cash', 1),
    ('Cartão crédito', 'credit', 2),
    ('Cartão débito', 'debit', 3)
) as v(name, kind, sort_order)
where not exists (
  select 1 from public.payment_methods pm where pm.store_id = s.id
);

alter table public.orders
  add column if not exists payment_method_label text;

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method is null
    or payment_method in ('pix', 'cash', 'card', 'credit', 'debit', 'other')
  );
