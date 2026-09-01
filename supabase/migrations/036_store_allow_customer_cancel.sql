-- 036 · permitir cancelamento do pedido pelo cliente no WhatsApp

alter table public.stores
  add column if not exists allow_customer_cancel boolean
    not null default false;
