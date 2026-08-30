-- 029 · tempo de preparo padrão e aceite automático de pedidos

alter table public.stores
  add column if not exists default_prep_minutes integer
    not null default 40
    check (default_prep_minutes >= 1 and default_prep_minutes <= 480);

alter table public.stores
  add column if not exists auto_accept_orders boolean
    not null default false;
