-- 037 · histórico de mensagens WhatsApp (chat da retaguarda)

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  author text not null check (author in ('customer', 'bot', 'agent')),
  body text not null default '',
  msg_type text not null default 'text',
  wa_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_conversation_created_idx
  on public.conversation_messages (conversation_id, created_at);

create index if not exists conversation_messages_customer_created_idx
  on public.conversation_messages (customer_id, created_at desc);

alter table public.conversations
  add column if not exists last_message_preview text;

alter table public.conversation_messages enable row level security;

drop policy if exists "conversation_messages_read" on public.conversation_messages;
create policy "conversation_messages_read"
  on public.conversation_messages for select
  to authenticated
  using (true);

grant select on public.conversation_messages to authenticated;

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
      and rel.relname = 'conversation_messages'
  ) then
    alter publication supabase_realtime add table public.conversation_messages;
  end if;
end $$;
