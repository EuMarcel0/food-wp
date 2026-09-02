-- Direção da última mensagem (inbound = cliente) para badge/som de não lidas.
alter table public.conversations
  add column if not exists last_message_direction text
  check (last_message_direction is null or last_message_direction in ('inbound', 'outbound'));
