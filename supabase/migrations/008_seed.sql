-- 008 · dados iniciais (loja demo + cardápio)

insert into public.stores (
  id, name, segment, delivery_enabled, pickup_enabled, delivery_fee_cents
) values (
  '00000000-0000-0000-0000-000000000001',
  'Estabelecimento Demo',
  'lanches',
  true,
  true,
  700
) on conflict (id) do update set
  name = excluded.name,
  segment = excluded.segment,
  delivery_enabled = excluded.delivery_enabled,
  pickup_enabled = excluded.pickup_enabled,
  delivery_fee_cents = excluded.delivery_fee_cents;

insert into public.categories (id, store_id, name, sort_order, active) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Lanches', 1, true),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Acompanhamentos', 2, true),
  ('00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'Bebidas', 3, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  active = excluded.active;

insert into public.products (
  id, store_id, category_id, name, description, price, active
) values
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    'X-Burguer',
    'Pão, carne e queijo',
    22.00,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    'X-Salada',
    'Pão, carne, queijo e salada',
    25.00,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000012',
    'Batata frita',
    'Porção média',
    14.00,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000013',
    'Refrigerante lata',
    '350ml',
    7.00,
    true
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  active = excluded.active;
