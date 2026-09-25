-- 050 · histórico de alterações do pedido (itens, pagamento, status)

create table if not exists public.order_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  action text not null
    check (action in (
      'order_created',
      'items_updated',
      'payment_updated',
      'status_updated'
    )),
  actor_name text not null,
  summary text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_logs_order_created_idx
  on public.order_logs (order_id, created_at desc);

create index if not exists order_logs_store_created_idx
  on public.order_logs (store_id, created_at desc);

alter table public.order_logs enable row level security;

drop policy if exists "order_logs_read" on public.order_logs;
create policy "order_logs_read"
  on public.order_logs for select
  to anon, authenticated
  using (true);

grant select on public.order_logs to anon, authenticated;
