-- 055 · status "Em preparo" removido: o aceite já informa o tempo estimado

update public.orders
set status = 'accepted', updated_at = now()
where status = 'preparing';
