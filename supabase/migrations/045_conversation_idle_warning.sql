-- Aviso de ociosidade (metade do tempo limite) antes de reiniciar o atendimento.
alter table public.conversations
  add column if not exists idle_warning_at timestamptz;

create index if not exists conversations_idle_warning_idx
  on public.conversations (last_message_at)
  where closed_at is null and idle_warning_at is null;
