-- 015 · observação por item do pedido

alter table public.order_items
  add column if not exists notes text;
