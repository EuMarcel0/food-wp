-- 023 · dados da empresa no cupom térmico (80 mm)

alter table public.stores
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists receipt_footer text;
