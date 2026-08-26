-- 004 · pedidos e itens

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  code text not null,
  status text not null default 'received'
    check (status in (
      'received',
      'preparing',
      'ready',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )),
  fulfillment text not null
    check (fulfillment in ('delivery', 'pickup')),
  payment_method text
    check (payment_method in ('pix', 'cash', 'card')),
  address_text text,
  notes text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  extras jsonb not null default '[]'::jsonb
);
