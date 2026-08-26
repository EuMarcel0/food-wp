-- 013 · grupos mutuamente exclusivos (tamanhos com cardápio próprio)

alter table public.product_option_groups
  add column if not exists exclusive_set text;
