-- 056 · pedidos com intervenção do atendente (clicou em Assumir) para o gráfico de desempenho do bot

alter table public.conversations
  add column if not exists assisted_at timestamptz;

alter table public.orders
  add column if not exists human_assisted boolean not null default false;

create index if not exists orders_created_at_idx on public.orders (created_at);
