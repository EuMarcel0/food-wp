-- 035 · início da conversa ativa (cronômetro no painel)

alter table public.conversations
  add column if not exists activated_at timestamptz;

-- Conversas já abertas: usa a última mensagem como ponto de partida aproximado.
update public.conversations
set activated_at = coalesce(activated_at, last_message_at, now())
where closed_at is null
  and activated_at is null;
