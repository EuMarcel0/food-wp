-- 049 · ordem dos itens do cardápio (lista do WhatsApp)

alter table public.products
  add column if not exists sort_order integer not null default 0;

-- Inicializa pela ordem alfabética atual dentro de cada categoria
with ranked as (
  select
    id,
    (row_number() over (
      partition by store_id, category_id
      order by name asc
    ) - 1)::integer as next_order
  from public.products
)
update public.products p
set sort_order = ranked.next_order
from ranked
where p.id = ranked.id
  and p.sort_order = 0;

create index if not exists products_category_sort_idx
  on public.products (store_id, category_id, sort_order, name);
