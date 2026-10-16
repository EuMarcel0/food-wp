-- Exemplo de pedido mostrado na saudação do bot v2 (texto configurável no painel).

alter table public.stores
  add column if not exists order_example_text text;
