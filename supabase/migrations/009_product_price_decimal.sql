-- 009 · preço do produto em reais (numeric 12,2), não mais centavos
-- Quem já rodou o schema antigo precisa desta migration.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price_cents'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'products'
        and column_name = 'price'
    ) then
      alter table public.products add column price numeric(12, 2);
    end if;

    update public.products
    set price = round((price_cents::numeric / 100), 2)
    where price is null;

    update public.products set price = 0 where price is null;

    alter table public.products alter column price set not null;
    alter table public.products alter column price set default 0;

    alter table public.products drop constraint if exists products_price_cents_check;
    alter table public.products drop column price_cents;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'price'
  ) then
    alter table public.products drop constraint if exists products_price_check;
    alter table public.products
      add constraint products_price_check check (price >= 0);
  end if;
end $$;
