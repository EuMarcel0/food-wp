-- Opções interativas (botões/lista) exibidas no painel de conversas.
alter table public.conversation_messages
  add column if not exists actions jsonb;
