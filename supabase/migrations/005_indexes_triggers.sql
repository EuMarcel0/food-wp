-- 005 · índices e updated_at

create index if not exists stores_segment_idx
  on public.stores (segment);

create index if not exists categories_store_sort_idx
  on public.categories (store_id, sort_order);

create index if not exists products_store_active_idx
  on public.products (store_id, active);

create index if not exists products_category_idx
  on public.products (category_id);

create index if not exists customers_store_phone_idx
  on public.customers (store_id, wa_phone);

create index if not exists conversations_store_idx
  on public.conversations (store_id, last_message_at desc);

create index if not exists orders_store_created_idx
  on public.orders (store_id, created_at desc);

create index if not exists orders_store_status_idx
  on public.orders (store_id, status);

create index if not exists orders_code_idx
  on public.orders (code);

create index if not exists order_items_order_idx
  on public.order_items (order_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();
