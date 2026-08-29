-- =============================================================================
-- Reset para novos testes
-- =============================================================================
-- Mantém: stores, categories, crusts (bordas), sizes (tamanhos)
--          e delivery_neighborhoods / config da loja
-- Apaga:  produtos, adicionais, pedidos, clientes, conversas, notificações
--
-- Como rodar (Supabase SQL Editor):
--   1. Abra o projeto no Supabase
--   2. SQL Editor → New query
--   3. Cole este arquivo e execute
-- =============================================================================

begin;

-- Notificações
delete from public.notification_reads;
delete from public.notifications;

-- Pedidos (order_items cai em cascade, mas limpamos explícito por clareza)
delete from public.order_items;
delete from public.orders;

-- Conversas WhatsApp
delete from public.conversations;
delete from public.customers;

-- Cardápio (opções / vínculos caem em cascade com products)
delete from public.product_addons;
delete from public.product_options;
delete from public.product_option_groups;
delete from public.products;

-- Adicionais (não entram no “essencial” pedido)
delete from public.addons;

commit;

-- Conferência rápida
select 'categories' as tabela, count(*)::int as qtd from public.categories
union all
select 'crusts', count(*)::int from public.crusts
union all
select 'sizes', count(*)::int from public.sizes
union all
select 'products', count(*)::int from public.products
union all
select 'addons', count(*)::int from public.addons
union all
select 'orders', count(*)::int from public.orders
union all
select 'customers', count(*)::int from public.customers
union all
select 'conversations', count(*)::int from public.conversations
union all
select 'notifications', count(*)::int from public.notifications
order by 1;
