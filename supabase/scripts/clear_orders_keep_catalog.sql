-- =============================================================================
-- Limpar pedidos de teste (go-live / começar do zero)
-- =============================================================================
-- APAGA (operacional / testes):
--   pedidos, itens, notificações, conversas WhatsApp, mensagens, clientes
--
-- MANTÉM (cadastros e config):
--   loja, categorias, produtos, opções/sabores, bordas, tamanhos,
--   adicionais, bairros de entrega, horários e demais configs
--
-- NÃO use reset_for_tests.sql para isso — aquele script também apaga o cardápio.
--
-- Como rodar (Supabase SQL Editor):
--   1. Abra o projeto no Supabase
--   2. SQL Editor → New query
--   3. Cole este arquivo e execute (Run)
-- =============================================================================

begin;

-- Notificações do painel (ligadas a pedidos)
delete from public.notification_reads;
delete from public.notifications;

-- Pedidos
-- (order_items tem ON DELETE CASCADE a partir de orders; limpamos explícito)
delete from public.order_items;
delete from public.orders;

-- Histórico WhatsApp dos testes
-- (conversation_messages cai em cascade com conversations; limpamos explícito)
delete from public.conversation_messages;
delete from public.conversations;

-- Clientes de teste (orders referencia customers com RESTRICT — já removidos acima)
delete from public.customers;

commit;

-- Conferência: operacional zerado, cadastro intacto
select 'orders' as tabela, count(*)::int as qtd from public.orders
union all
select 'order_items', count(*)::int from public.order_items
union all
select 'notifications', count(*)::int from public.notifications
union all
select 'customers', count(*)::int from public.customers
union all
select 'conversations', count(*)::int from public.conversations
union all
select 'conversation_messages', count(*)::int from public.conversation_messages
union all
select 'categories', count(*)::int from public.categories
union all
select 'products', count(*)::int from public.products
union all
select 'addons', count(*)::int from public.addons
union all
select 'crusts', count(*)::int from public.crusts
union all
select 'sizes', count(*)::int from public.sizes
union all
select 'delivery_neighborhoods', count(*)::int from public.delivery_neighborhoods
union all
select 'stores', count(*)::int from public.stores
order by 1;
