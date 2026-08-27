-- 022 · nome e foto do perfil do estabelecimento (WhatsApp + painel)

alter table public.stores
  add column if not exists profile_photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'store-branding',
  'store-branding',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "store_branding_public_read" on storage.objects;
create policy "store_branding_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'store-branding');
