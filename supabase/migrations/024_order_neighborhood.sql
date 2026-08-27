-- 024 · bairro da entrega no pedido (cupom e retaguarda)

alter table public.orders
  add column if not exists neighborhood_id uuid references public.delivery_neighborhoods(id) on delete set null,
  add column if not exists neighborhood_name text;
