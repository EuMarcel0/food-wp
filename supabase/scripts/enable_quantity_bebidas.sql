-- Ativa "Solicitar quantidade?" em todos os itens da categoria Bebidas.
-- Rode no SQL Editor do Supabase (após a migration 042_product_quantity_enabled.sql).

update public.products
set quantity_enabled = true
where category_id = '00000000-0000-0000-0000-000000000013';
