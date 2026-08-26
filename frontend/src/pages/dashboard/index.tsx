import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../lib/api";
import { formatBRL } from "../../lib/format";
import type { OrderStats, Store } from "../../types";

const SUBTITLE_SUFFIX =
  "o bot responde o cliente no WhatsApp e esta tela atualiza o status da cozinha.";

export function DashboardPage() {
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [storeReady, setStoreReady] = useState(false);

  useEffect(() => {
    api.orderStats().then(setStats).catch(() =>
      setStats({ total: 0, open: 0, totalCents: 0 }),
    );
    api
      .store()
      .then(setStore)
      .catch(() => setStore(null))
      .finally(() => setStoreReady(true));
  }, []);

  const title = store?.name ?? "Estabelecimento";
  const subtitle = `Segmento: ${store?.segment ?? "food"} · ${SUBTITLE_SUFFIX}`;

  return (
    <>
      <div className={storeReady ? undefined : "page-header-pending"}>
        <PageHeader title={title} subtitle={subtitle} />
      </div>
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
    </>
  );
}
