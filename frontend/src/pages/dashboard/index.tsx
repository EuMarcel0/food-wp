import { useEffect, useState } from "react";
import { Tag } from "antd";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../lib/api";
import { formatBRL } from "../../lib/format";
import type { Health, OrderStats, Store } from "../../types";

export function DashboardPage() {
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api.orderStats().then(setStats).catch(() =>
      setStats({ total: 0, open: 0, totalCents: 0 }),
    );
    api.store().then(setStore).catch(() => setStore(null));
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <>
      <PageHeader
        title={store?.name ?? "Estabelecimento"}
        subtitle={`Segmento: ${store?.segment ?? "food"} · o bot responde o cliente no WhatsApp e esta tela atualiza o status da cozinha.`}
      />
      <div className="stat-grid">
        <article className="stat-card">
          <span className="stat-label">Pedidos em aberto</span>
          <strong className="stat-value">{stats?.open ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Pedidos no painel</span>
          <strong className="stat-value">{stats?.total ?? 0}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Total listado</span>
          <strong className="stat-value">{formatBRL(stats?.totalCents ?? 0)}</strong>
        </article>
      </div>
      <section className="panel-card">
        <h4>Conexões</h4>
        <Tag color={health?.whatsapp ? "green" : "orange"}>
          WhatsApp {health?.whatsapp ? "pronto" : "aguardando .env"}
        </Tag>
        <Tag color={health?.supabase ? "green" : "orange"}>
          Supabase {health?.supabase ? "conectado" : "modo memória"}
        </Tag>
      </section>
    </>
  );
}
