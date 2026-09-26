-- 052 · log de alteração de tipo (entrega/retirada) + ação no order_logs

alter table public.order_logs drop constraint if exists order_logs_action_check;

alter table public.order_logs
  add constraint order_logs_action_check
  check (action in (
    'order_created',
    'items_updated',
    'payment_updated',
    'status_updated',
    'fulfillment_updated'
  ));
