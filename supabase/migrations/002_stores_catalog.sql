-- 002 · estabelecimento e cardápio

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null default 'generic',
  phone text,
  timezone text not null default 'America/Sao_Paulo',
  delivery_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  description text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  image_url text,
  active boolean not null default true
);
