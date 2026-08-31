-- 032 · foto do cliente (quando a Meta enviar) para o painel de conversas

alter table public.customers
  add column if not exists avatar_url text;
