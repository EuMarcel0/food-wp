-- 054 · tipo "mixed" para formas combinadas (ex.: Dinheiro+Pix), sem pergunta de troco

alter table public.payment_methods
  drop constraint if exists payment_methods_kind_check;

alter table public.payment_methods
  add constraint payment_methods_kind_check
  check (kind in ('pix', 'cash', 'credit', 'debit', 'mixed', 'other'));

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (
    payment_method is null
    or payment_method in ('pix', 'cash', 'card', 'credit', 'debit', 'mixed', 'other')
  );
