-- 043 · categorias com montagem em lote (quantidade antes dos itens)

alter table public.stores
  add column if not exists batch_category_ids uuid[] not null default '{}';
