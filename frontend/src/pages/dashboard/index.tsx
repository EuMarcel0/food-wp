import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../lib/api";
import { formatBRL } from "../../lib/format";
import { queryKeys } from "../../lib/queryKeys";
import type { OrderStats } from "../../types";

const SUBTITLE_SUFFIX =
  "o bot responde o cliente no WhatsApp e esta tela atualiza o status da cozinha.";

const emptyStats: OrderStats = { total: 0, open: 0, totalCents: 0 };

export function DashboardPage() {
  const storeQuery = useQuery({
    queryKey: queryKeys.store,
    queryFn: api.store,
  });
  const statsQuery = useQuery({
    queryKey: queryKeys.stats,
    queryFn: api.orderStats,
  });

  const store = storeQuery.data;
  const showHeader = Boolean(store) || storeQuery.isFetched;
  const stats = statsQuery.data ?? emptyStats;
  const title = store?.name ?? "Estabelecimento";
  const subtitle = `Segmento: ${store?.segment ?? "food"} · ${SUBTITLE_SUFFIX}`;

  return (
    <>
      <div className={showHeader ? undefined : "page-header-pending"}>
        <PageHeader title={title} subtitle={subtitle} />
      </div>
      <div className="stat-grid">
        <article className="stat-card">
          <span className="stat-label">Pedidos em aberto</span>
          <strong className="stat-value">{stats.open}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Pedidos no painel</span>
          <strong className="stat-value">{stats.total}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Total listado</span>
          <strong className="stat-value">{formatBRL(stats.totalCents)}</strong>
        </article>
      </div>
    </>
  );
}
