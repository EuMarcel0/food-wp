-- 051 · motivo do cancelamento no pedido

alter table public.orders
  add column if not exists cancel_reason text;

comment on column public.orders.cancel_reason is
  'Motivo informado ao cancelar o pedido (painel ou WhatsApp).';
