-- 019 · tempo estimado de preparo do pedido

alter table public.orders
  add column if not exists prep_minutes integer
  check (prep_minutes is null or prep_minutes >= 1);
