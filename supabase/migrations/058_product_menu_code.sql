-- 058 · código do cardápio (nº único da pizza, ex.: 01–28) para pedido por número no WhatsApp

alter table public.products
  add column if not exists menu_code integer
    check (menu_code is null or menu_code > 0);

comment on column public.products.menu_code is
  'Número do sabor no cardápio impresso (único por loja entre pizzas). Ex.: 05 = Calabresa.';

create unique index if not exists products_store_menu_code_uidx
  on public.products (store_id, menu_code)
  where menu_code is not null;
