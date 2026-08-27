-- 020 · crédito/débito e troco em dinheiro

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method is null
    or payment_method in ('pix', 'cash', 'card', 'credit', 'debit')
  );

alter table public.orders
  add column if not exists change_for_cents integer
  check (change_for_cents is null or change_for_cents >= 0);
