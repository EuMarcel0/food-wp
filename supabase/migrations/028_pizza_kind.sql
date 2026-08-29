-- 028 · tipo da pizza (doce ou salgada) para não misturar sabores

alter table public.products
  add column if not exists pizza_kind text
    check (pizza_kind is null or pizza_kind in ('salgada', 'doce'));
