-- 027 · dias e horários de funcionamento do estabelecimento

alter table public.stores
  add column if not exists business_hours jsonb;
