-- 030 · handoff humano nas conversas + realtime no painel

alter table public.conversations
  add column if not exists handoff_mode text not null default 'bot',
  add column if not exists handoff_at timestamptz,
  add column if not exists handoff_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_handoff_mode_check'
  ) then
    alter table public.conversations
      add constraint conversations_handoff_mode_check
      check (handoff_mode in ('bot', 'human'));
  end if;
end $$;

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc);

create index if not exists conversations_handoff_mode_idx
  on public.conversations (handoff_mode)
  where handoff_mode = 'human';

drop policy if exists "conversations_read" on public.conversations;
create policy "conversations_read"
  on public.conversations for select
  to authenticated
  using (true);

grant select on public.conversations to authenticated;

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
      and rel.relname = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;
