-- 031 · fecha conversa ao virar pedido (ativas vs histórico)

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
