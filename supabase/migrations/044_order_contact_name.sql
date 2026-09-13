-- Nome de contato informado no checkout (usado no pedido e no cupom).
alter table public.orders
  add column if not exists contact_name text;

comment on column public.orders.contact_name is
  'Nome informado pelo cliente no WhatsApp para contato/cupom.';
