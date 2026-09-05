-- 042 · pedir quantidade no WhatsApp (opcional por item)

alter table public.products
  add column if not exists quantity_enabled boolean not null default false;
