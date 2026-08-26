-- 014 · tempo limite de inatividade do bot

alter table public.stores
  add column if not exists idle_timeout_minutes integer not null default 60;
