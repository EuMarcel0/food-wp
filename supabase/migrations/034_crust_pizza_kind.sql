-- 034 · borda doce ou salgada (filtra no WhatsApp pelo tipo da pizza)

alter table public.crusts
  add column if not exists pizza_kind text;

update public.crusts
set pizza_kind = 'salgada'
where pizza_kind is null or btrim(pizza_kind) = '';

alter table public.crusts
  alter column pizza_kind set default 'salgada';

alter table public.crusts
  alter column pizza_kind set not null;

alter table public.crusts drop constraint if exists crusts_pizza_kind_check;

alter table public.crusts
  add constraint crusts_pizza_kind_check
  check (pizza_kind in ('salgada', 'doce'));

-- Garante "Sem Borda" também para pizza doce (idempotente).
insert into public.crusts (store_id, name, adds_price, price, sort_order, active, pizza_kind)
select s.id, 'Sem Borda', false, 0, 0, true, 'doce'
from public.stores s
where not exists (
  select 1
  from public.crusts c
  where c.store_id = s.id
    and c.pizza_kind = 'doce'
    and lower(c.name) = 'sem borda'
);
