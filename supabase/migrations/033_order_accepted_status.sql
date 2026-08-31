-- 033 · status Aceito + tempo estimado ligado ao aceite (não ao preparo)

alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in (
    'received',
    'accepted',
    'preparing',
    'ready',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stores'
      and column_name = 'default_prep_minutes'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stores'
      and column_name = 'default_accept_minutes'
  ) then
    alter table public.stores
      rename column default_prep_minutes to default_accept_minutes;
  end if;
end $$;

alter table public.stores
  add column if not exists default_accept_minutes integer
    not null default 40
    check (default_accept_minutes >= 1 and default_accept_minutes <= 480);
