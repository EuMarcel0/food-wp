-- 047 · fila de impressão automática (aceite → cupom)

alter table public.orders
  add column if not exists auto_print_requested_at timestamptz,
  add column if not exists auto_print_claimed_at timestamptz,
  add column if not exists auto_print_claimed_by text,
  add column if not exists auto_printed_at timestamptz;

create index if not exists orders_auto_print_pending_idx
  on public.orders (auto_print_requested_at)
  where auto_print_requested_at is not null
    and auto_printed_at is null;
