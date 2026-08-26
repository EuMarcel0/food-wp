-- 010 · notificações de pedido criado / alterado

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  type text not null check (type in ('order_created', 'order_updated')),
  order_id uuid references public.orders(id) on delete cascade,
  order_code text not null,
  title text not null,
  change_summary text,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  reader_key text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, reader_key)
);

create index if not exists notifications_store_created_idx
  on public.notifications (store_id, created_at desc);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists "notifications_read" on public.notifications;
create policy "notifications_read"
  on public.notifications for select
  to anon, authenticated
  using (true);

grant select on public.notifications to anon, authenticated;

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
      and rel.relname = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
