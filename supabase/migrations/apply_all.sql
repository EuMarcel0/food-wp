-- Food WP · aplicar tudo de uma vez no SQL Editor do Supabase
-- Ordem: 001 → 008

-- ========== 001_extensions ==========
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ========== 002_stores_catalog ==========
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

-- ========== 003_customers_conversations ==========
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  wa_phone text not null,
  name text,
  created_at timestamptz not null default now(),
  unique (store_id, wa_phone)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  state text not null default 'welcome',
  context jsonb not null default '{"cart":[]}'::jsonb,
  last_message_at timestamptz not null default now(),
  unique (customer_id)
);

-- ========== 004_orders ==========
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  code text not null,
  status text not null default 'received'
    check (status in (
      'received',
      'accepted',
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

-- ========== 005_indexes_triggers ==========
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

-- ========== 006_rls ==========
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

-- ========== 007_realtime ==========
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel prel
    join pg_publication pub on pub.oid = prel.prpubid
    join pg_class rel on rel.oid = prel.prrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where pub.pubname = 'supabase_realtime'
      and nsp.nspname = 'public'
      and rel.relname = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1
    from pg_publication_rel prel
    join pg_publication pub on pub.oid = prel.prpubid
    join pg_class rel on rel.oid = prel.prrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where pub.pubname = 'supabase_realtime'
      and nsp.nspname = 'public'
      and rel.relname = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;

-- ========== 008_seed ==========
insert into public.stores (
  id, name, segment, delivery_enabled, pickup_enabled, delivery_fee_cents
) values (
  '00000000-0000-0000-0000-000000000001',
  'Estabelecimento Demo',
  'lanches',
  true,
  true,
  700
) on conflict (id) do update set
  name = excluded.name,
  segment = excluded.segment,
  delivery_enabled = excluded.delivery_enabled,
  pickup_enabled = excluded.pickup_enabled,
  delivery_fee_cents = excluded.delivery_fee_cents;

insert into public.categories (id, store_id, name, sort_order, active) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Lanches', 1, true),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Acompanhamentos', 2, true),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Bebidas', 3, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = excluded.active;

insert into public.products (
  id, store_id, category_id, name, description, price, active
) values
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    'X-Burguer',
    'Pão, carne e queijo',
    22.00,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    'X-Salada',
    'Pão, carne, queijo e salada',
    25.00,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000012',
    'Batata frita',
    'Porção média',
    14.00,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000013',
    'Refrigerante lata',
    '350ml',
    7.00,
    true
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  active = excluded.active;

-- ========== 010_notifications ==========
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  type text not null check (type in ('order_created', 'order_updated')),
  order_id uuid references public.orders(id) on delete cascade,
  order_code text not null,
  title text not null,
  change_summary text,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  reader_key text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, reader_key)
);

create index if not exists notifications_store_created_idx
  on public.notifications (store_id, created_at desc);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists "notifications_read" on public.notifications;
create policy "notifications_read"
  on public.notifications for select
  to anon, authenticated
  using (true);

grant select on public.notifications to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel prel
    join pg_publication pub on pub.oid = prel.prpubid
    join pg_class rel on rel.oid = prel.prrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where pub.pubname = 'supabase_realtime'
      and nsp.nspname = 'public'
      and rel.relname = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ========== 011_avatars_storage ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_own_insert" on storage.objects;
create policy "avatars_own_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ========== 012_product_options ==========
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

-- ========== 013_option_group_exclusive ==========
alter table public.product_option_groups
  add column if not exists exclusive_set text;

-- ========== 014_store_idle_timeout ==========
alter table public.stores
  add column if not exists idle_timeout_minutes integer not null default 60;

-- ========== 015_order_item_notes ==========
alter table public.order_items
  add column if not exists notes text;

-- ========== 016_product_notes_enabled ==========
alter table public.products
  add column if not exists notes_enabled boolean not null default false;

-- ========== 017_option_group_price ==========
alter table public.product_option_groups
  add column if not exists price numeric(12, 2) not null default 0 check (price >= 0);

-- ========== 018_delivery_neighborhoods ==========
create table if not exists public.delivery_neighborhoods (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  fee_cents integer not null default 0 check (fee_cents >= 0),
  created_at timestamptz not null default now()
);

create unique index if not exists delivery_neighborhoods_store_name_idx
  on public.delivery_neighborhoods (store_id, lower(trim(name)));

create index if not exists delivery_neighborhoods_store_idx
  on public.delivery_neighborhoods (store_id, name);

alter table public.delivery_neighborhoods enable row level security;

drop policy if exists "delivery_neighborhoods_read" on public.delivery_neighborhoods;
create policy "delivery_neighborhoods_read"
  on public.delivery_neighborhoods for select
  to anon, authenticated
  using (true);

grant select on public.delivery_neighborhoods
  to anon, authenticated;

-- ========== 019_order_prep_minutes ==========
alter table public.orders
  add column if not exists prep_minutes integer
  check (prep_minutes is null or prep_minutes >= 1);

-- ========== 020_payment_change_and_cards ==========
alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method is null
    or payment_method in ('pix', 'cash', 'card', 'credit', 'debit')
  );

alter table public.orders
  add column if not exists change_for_cents integer
  check (change_for_cents is null or change_for_cents >= 0);

-- ========== 021_addons ==========
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

-- ========== 022_store_branding ==========
alter table public.stores
  add column if not exists profile_photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-branding',
  'store-branding',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "store_branding_public_read" on storage.objects;
create policy "store_branding_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'store-branding');

-- ========== 023_store_receipt ==========
alter table public.stores
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists receipt_footer text;

-- ========== 024_order_neighborhood ==========
alter table public.orders
  add column if not exists neighborhood_id uuid references public.delivery_neighborhoods(id) on delete set null,
  add column if not exists neighborhood_name text;

-- ========== 025_crusts ==========
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

-- ========== 026_sizes ==========
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

-- ========== 027_store_hours ==========
alter table public.stores
  add column if not exists business_hours jsonb;

-- ========== 028_pizza_kind ==========
alter table public.products
  add column if not exists pizza_kind text
    check (pizza_kind is null or pizza_kind in ('salgada', 'doce'));

-- ========== 029_store_auto_prep ==========
alter table public.stores
  add column if not exists default_accept_minutes integer
    not null default 40
    check (default_accept_minutes >= 1 and default_accept_minutes <= 480);

alter table public.stores
  add column if not exists auto_accept_orders boolean
    not null default false;

-- ========== 030_conversation_handoff ==========
alter table public.conversations
  add column if not exists handoff_mode text not null default 'bot',
  add column if not exists handoff_at timestamptz,
  add column if not exists handoff_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_handoff_mode_check'
  ) then
    alter table public.conversations
      add constraint conversations_handoff_mode_check
      check (handoff_mode in ('bot', 'human'));
  end if;
end $$;

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc);

create index if not exists conversations_handoff_mode_idx
  on public.conversations (handoff_mode)
  where handoff_mode = 'human';

drop policy if exists "conversations_read" on public.conversations;
create policy "conversations_read"
  on public.conversations for select
  to authenticated
  using (true);

grant select on public.conversations to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel prel
    join pg_publication pub on pub.oid = prel.prpubid
    join pg_class rel on rel.oid = prel.prrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where pub.pubname = 'supabase_realtime'
      and nsp.nspname = 'public'
      and rel.relname = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- ========== 031_conversation_closed ==========
alter table public.conversations
  add column if not exists closed_at timestamptz,
  add column if not exists last_order_id uuid references public.orders(id) on delete set null,
  add column if not exists last_order_code text;

create index if not exists conversations_closed_at_idx
  on public.conversations (closed_at)
  where closed_at is null;

create index if not exists conversations_last_order_idx
  on public.conversations (last_order_id)
  where last_order_id is not null;

-- ========== 032_customer_avatar ==========
alter table public.customers
  add column if not exists avatar_url text;

-- ========== 033_order_accepted_status ==========
alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in (
    'received',
    'accepted',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stores'
      and column_name = 'default_prep_minutes'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stores'
      and column_name = 'default_accept_minutes'
  ) then
    alter table public.stores
      rename column default_prep_minutes to default_accept_minutes;
  end if;
end $$;

alter table public.stores
  add column if not exists default_accept_minutes integer
    not null default 40
    check (default_accept_minutes >= 1 and default_accept_minutes <= 480);

-- ========== 034_crust_pizza_kind ==========
alter table public.crusts
  add column if not exists pizza_kind text;

update public.crusts
set pizza_kind = 'salgada'
where pizza_kind is null or btrim(pizza_kind) = '';

alter table public.crusts
  alter column pizza_kind set default 'salgada';

alter table public.crusts
  alter column pizza_kind set not null;

alter table public.crusts drop constraint if exists crusts_pizza_kind_check;

alter table public.crusts
  add constraint crusts_pizza_kind_check
  check (pizza_kind in ('salgada', 'doce'));

insert into public.crusts (store_id, name, adds_price, price, sort_order, active, pizza_kind)
select s.id, 'Sem Borda', false, 0, 0, true, 'doce'
from public.stores s
where not exists (
  select 1
  from public.crusts c
  where c.store_id = s.id
    and c.pizza_kind = 'doce'
    and lower(c.name) = 'sem borda'
);


