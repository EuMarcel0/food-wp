-- Versão do fluxo do bot no WhatsApp (v1 = completo com menus; v2 = simplificado com IA)
-- e imagem do cardápio enviada na saudação da v2.

alter table public.stores
  add column if not exists bot_flow_version text not null default 'v1';

alter table public.stores
  drop constraint if exists stores_bot_flow_version_check;

alter table public.stores
  add constraint stores_bot_flow_version_check check (bot_flow_version in ('v1', 'v2'));

alter table public.stores
  add column if not exists menu_image_url text;
