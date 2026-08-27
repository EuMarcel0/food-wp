-- 017 · preço por grupo de tamanho (montável)

alter table public.product_option_groups
  add column if not exists price numeric(12, 2) not null default 0 check (price >= 0);
