-- 003 · clientes WhatsApp e estado da conversa

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
