create extension if not exists pgcrypto;

create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null default 'generic',
  phone text,
  timezone text not null default 'America/Sao_Paulo',
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  delivery_fee_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  name text not null,
  description text,
  price numeric(12, 2) not null default 0,
  image_url text,
  active boolean not null default true
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  wa_phone text not null,
  name text,
  created_at timestamptz not null default now(),
  unique (store_id, wa_phone)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  state text not null default 'welcome',
  context jsonb not null default '{"cart":[]}'::jsonb,
  last_message_at timestamptz not null default now(),
  unique (customer_id)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  code text not null,
  status text not null default 'received',
  fulfillment text not null,
  payment_method text,
  address_text text,
  notes text,
  subtotal_cents integer not null default 0,
  delivery_fee_cents integer not null default 0,
  total_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code)
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  quantity integer not null,
  unit_price_cents integer not null,
  extras jsonb not null default '[]'::jsonb
);

create index if not exists orders_store_created_idx on orders (store_id, created_at desc);
create index if not exists products_store_active_idx on products (store_id, active);

alter table stores enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table conversations enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- O backend usa service role e ignora RLS.
-- Estas policies só servem para o painel ler o cardápio e ouvir realtime.
create policy "catalog_read" on stores for select to anon using (true);
create policy "categories_read" on categories for select to anon using (true);
create policy "products_read" on products for select to anon using (true);
create policy "orders_read" on orders for select to anon using (true);
create policy "order_items_read" on order_items for select to anon using (true);
