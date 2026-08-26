-- 007 · realtime para o painel de pedidos

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel prel
    join pg_publication pub on pub.oid = prel.prpubid
    join pg_class rel on rel.oid = prel.prrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where pub.pubname = 'supabase_realtime'
      and nsp.nspname = 'public'
      and rel.relname = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1
    from pg_publication_rel prel
    join pg_publication pub on pub.oid = prel.prpubid
    join pg_class rel on rel.oid = prel.prrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where pub.pubname = 'supabase_realtime'
      and nsp.nspname = 'public'
      and rel.relname = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;
