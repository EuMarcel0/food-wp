import { useQuery } from "@tanstack/react-query";
import { HeaderSkeleton, StatCardsSkeleton } from "../../components/PageSkeletons";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../lib/api";
import { formatBRL } from "../../lib/format";
import { queryKeys } from "../../lib/queryKeys";

const SUBTITLE_SUFFIX =
  "o bot responde o cliente no WhatsApp e esta tela atualiza o status da cozinha.";

export function DashboardPage() {
  const storeQuery = useQuery({
    queryKey: queryKeys.store,
    queryFn: api.store,
  });
  const statsQuery = useQuery({
    queryKey: queryKeys.stats,
    queryFn: api.orderStats,
  });

  const loading = storeQuery.isLoading || statsQuery.isLoading;
  const store = storeQuery.data;
  const stats = statsQuery.data;
  const title = store?.name ?? "Estabelecimento";
  const subtitle = `Segmento: ${store?.segment ?? "food"} · ${SUBTITLE_SUFFIX}`;

  if (loading || !stats) {
    return (
      <>
        <HeaderSkeleton />
        <StatCardsSkeleton />
      </>
    );
  }

  return (
    <>
      <PageHeader kicker="Cozinha" title={title} subtitle={subtitle} />
      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <article className="relative overflow-hidden rounded-2xl border border-food-accent/35 bg-[color-mix(in_srgb,var(--food-accent)_8%,var(--food-surface))] px-[18px] pt-[18px] pb-5 shadow-food-soft before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-food-accent before:content-['']">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-food-muted">Pedidos em aberto</span>
          <strong className="block text-[32px] leading-tight font-extrabold tracking-tight text-food-text tabular-nums">{stats.open}</strong>
        </article>
        <article className="relative overflow-hidden rounded-2xl border border-food-border bg-food-surface px-[18px] pt-[18px] pb-5 shadow-food-soft">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-food-muted">Pedidos no painel</span>
          <strong className="block text-[32px] leading-tight font-extrabold tracking-tight text-food-text tabular-nums">{stats.total}</strong>
        </article>
        <article className="relative overflow-hidden rounded-2xl border border-food-border bg-food-surface px-[18px] pt-[18px] pb-5 shadow-food-soft">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-food-muted">Total listado</span>
          <strong className="block text-[32px] leading-tight font-extrabold tracking-tight text-food-text tabular-nums">{formatBRL(stats.totalCents)}</strong>
        </article>
      </div>
    </>
  );
}
