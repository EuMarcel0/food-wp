-- 016 · observação opcional por item do cardápio

alter table public.products
  add column if not exists notes_enabled boolean not null default false;
