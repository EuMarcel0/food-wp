-- Última mensagem do cliente (não sobrescrita quando o bot responde).
alter table public.conversations
  add column if not exists last_inbound_at timestamptz;

create index if not exists conversations_last_inbound_at_idx
  on public.conversations (last_inbound_at desc nulls last)
  where closed_at is null;
