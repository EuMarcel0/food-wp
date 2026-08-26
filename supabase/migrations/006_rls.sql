-- 006 · RLS e policies
-- service_role ignora RLS. O painel logado usa a role authenticated.

alter table public.stores enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.conversations enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "stores_read" on public.stores;
drop policy if exists "catalog_read" on public.stores;
drop policy if exists "categories_read" on public.categories;
drop policy if exists "products_read" on public.products;
drop policy if exists "customers_read" on public.customers;
drop policy if exists "orders_read" on public.orders;
drop policy if exists "order_items_read" on public.order_items;

create policy "stores_read"
  on public.stores for select
  to anon, authenticated
  using (true);

create policy "categories_read"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "products_read"
  on public.products for select
  to anon, authenticated
  using (true);

create policy "customers_read"
  on public.customers for select
  to authenticated
  using (true);

create policy "orders_read"
  on public.orders for select
  to anon, authenticated
  using (true);

create policy "order_items_read"
  on public.order_items for select
  to anon, authenticated
  using (true);

grant usage on schema public to anon, authenticated;

grant select on public.stores, public.categories, public.products,
  public.orders, public.order_items
  to anon, authenticated;

grant select on public.customers to authenticated;
