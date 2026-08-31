import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ShopOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { HeaderSkeleton, StatCardsSkeleton } from "../../components/PageSkeletons";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../lib/api";
import { STATUS_LABEL } from "../../lib/format";
import { isStoreOpenNow, todayHoursLabel } from "../../lib/hours";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/cn";
import type { OrderStats, OrderStatus } from "../../types";

const SUBTITLE_SUFFIX =
  "acompanhe a fila da cozinha e o ritmo do dia — sem valores financeiros nesta tela.";

const EMPTY_BY_STATUS: Record<OrderStatus, number> = {
  received: 0,
  accepted: 0,
  preparing: 0,
  ready: 0,
  out_for_delivery: 0,
  delivered: 0,
  cancelled: 0,
};

const EMPTY_STATS: OrderStats = {
  open: 0,
  total: 0,
  byStatus: { ...EMPTY_BY_STATUS },
  today: { created: 0, delivered: 0, cancelled: 0, open: 0 },
  openByFulfillment: { delivery: 0, pickup: 0 },
  oldestOpenMinutes: null,
  avgPrepMinutesToday: null,
};

function normalizeStats(raw: OrderStats | undefined): OrderStats {
  if (!raw) return EMPTY_STATS;
  // Payload antigo (só open/total/totalCents): ignora campos parciais.
  const byStatus = raw.byStatus
    ? { ...EMPTY_BY_STATUS, ...raw.byStatus }
    : { ...EMPTY_BY_STATUS };
  return {
    open: Number(raw.open ?? 0),
    total: Number(raw.total ?? 0),
    byStatus,
    today: {
      created: Number(raw.today?.created ?? 0),
      delivered: Number(raw.today?.delivered ?? 0),
      cancelled: Number(raw.today?.cancelled ?? 0),
      open: Number(raw.today?.open ?? 0),
    },
    openByFulfillment: {
      delivery: Number(raw.openByFulfillment?.delivery ?? 0),
      pickup: Number(raw.openByFulfillment?.pickup ?? 0),
    },
    oldestOpenMinutes:
      raw.oldestOpenMinutes == null ? null : Number(raw.oldestOpenMinutes),
    avgPrepMinutesToday:
      raw.avgPrepMinutesToday == null ? null : Number(raw.avgPrepMinutesToday),
  };
}

const PIPELINE: OrderStatus[] = [
  "received",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
];

const PIPELINE_TONE: Record<
  (typeof PIPELINE)[number],
  { bar: string; chip: string }
> = {
  received: {
    bar: "bg-food-accent",
    chip: "border-food-accent/40 bg-[color-mix(in_srgb,var(--food-accent)_10%,var(--food-surface))]",
  },
  accepted: {
    bar: "bg-blue-500",
    chip: "border-blue-200 bg-blue-50",
  },
  preparing: {
    bar: "bg-amber-500",
    chip: "border-amber-200 bg-amber-50",
  },
  ready: {
    bar: "bg-green-500",
    chip: "border-green-200 bg-green-50",
  },
  out_for_delivery: {
    bar: "bg-sky-500",
    chip: "border-sky-200 bg-sky-50",
  },
};

function formatWait(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border px-[18px] pt-[18px] pb-5 shadow-food-soft",
        accent
          ? "border-food-accent/35 bg-[color-mix(in_srgb,var(--food-accent)_8%,var(--food-surface))] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-food-accent before:content-['']"
          : "border-food-border bg-food-surface",
      )}
    >
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-food-muted">
        {label}
      </span>
      <strong className="block text-[32px] leading-tight font-extrabold tracking-tight text-food-text tabular-nums">
        {value}
      </strong>
      {hint ? (
        <p className="m-0 mt-2 text-[12px] leading-snug text-food-muted">{hint}</p>
      ) : null}
    </article>
  );
}

export function DashboardPage() {
  const storeQuery = useQuery({
    queryKey: queryKeys.store,
    queryFn: api.store,
  });
  const statsQuery = useQuery({
    queryKey: queryKeys.stats,
    queryFn: api.orderStats,
    refetchInterval: 30_000,
  });
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
    refetchInterval: 60_000,
  });

  // Health não bloqueia a tela; só store + stats.
  const loading = storeQuery.isPending || statsQuery.isPending;
  const store = storeQuery.data;
  const stats = normalizeStats(statsQuery.data);
  const health = healthQuery.data;
  const title = store?.name ?? "Estabelecimento";
  const subtitle = `Segmento: ${store?.segment ?? "food"} · ${SUBTITLE_SUFFIX}`;

  if (loading) {
    return (
      <>
        <HeaderSkeleton />
        <StatCardsSkeleton />
      </>
    );
  }

  const openNow = isStoreOpenNow(
    store?.businessHours,
    store?.timezone ?? "America/Sao_Paulo",
  );
  const hoursToday = todayHoursLabel(
    store?.businessHours,
    store?.timezone ?? "America/Sao_Paulo",
  );
  const openDelivery = stats.openByFulfillment.delivery;
  const openPickup = stats.openByFulfillment.pickup;
  const deliveryShare =
    stats.open > 0 ? Math.round((openDelivery / stats.open) * 100) : 0;
  const pickupShare = stats.open > 0 ? 100 - deliveryShare : 0;

  return (
    <div className="flex min-h-full flex-col gap-5">
      <PageHeader
        className="mb-0"
        kicker="Cozinha"
        title={title}
        subtitle={subtitle}
        extra={
          <div className="flex flex-wrap items-center gap-2">
            <Tag color={openNow ? "success" : "default"} className="m-0 px-2.5 py-0.5">
              {openNow ? "Aberto agora" : "Fora do horário"}
            </Tag>
            <Tag
              color={health?.whatsapp ? "green" : "orange"}
              className="m-0 px-2.5 py-0.5"
            >
              WhatsApp {health?.whatsapp ? "ok" : "pendente"}
            </Tag>
            <Tag
              color={store?.autoAcceptOrders ? "blue" : "default"}
              className="m-0 px-2.5 py-0.5"
            >
              Aceite {store?.autoAcceptOrders ? "automático" : "manual"}
            </Tag>
          </div>
        }
      />

      <section className="grid grid-cols-4 gap-4 max-xl:grid-cols-2 max-sm:grid-cols-1">
        <StatTile
          accent
          label="Na fila"
          value={stats.open}
          hint={
            stats.oldestOpenMinutes != null && stats.open > 0
              ? `Mais antigo há ${formatWait(stats.oldestOpenMinutes)}`
              : "Nenhum pedido em andamento"
          }
        />
        <StatTile
          label="Novos hoje"
          value={stats.today.created}
          hint={`${stats.today.open} ainda na fila`}
        />
        <StatTile
          label="Entregues hoje"
          value={stats.today.delivered}
          hint={
            stats.avgPrepMinutesToday != null
              ? `Preparo médio ${stats.avgPrepMinutesToday} min`
              : "Sem tempo de preparo registrado"
          }
        />
        <StatTile
          label="Cancelados hoje"
          value={stats.today.cancelled}
          hint={`Horário de hoje: ${hoursToday}`}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-food-border px-5 py-4">
          <div>
            <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-food-accent">
              Fila da cozinha
            </p>
            <h2 className="m-0 text-base font-bold tracking-tight text-food-text">
              Pedidos por status
            </h2>
          </div>
          <Link
            to="/pedidos"
            className="text-[13px] font-semibold text-food-accent no-underline hover:underline"
          >
            Abrir pedidos →
          </Link>
        </div>
        <div className="grid grid-cols-5 gap-3 p-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {PIPELINE.map((status) => {
            const count = stats.byStatus[status] ?? 0;
            const tone = PIPELINE_TONE[status];
            return (
              <div
                key={status}
                className={cn(
                  "relative overflow-hidden rounded-xl border px-3.5 py-3.5",
                  tone.chip,
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 w-[3px]",
                    tone.bar,
                  )}
                />
                <span className="mb-1.5 block pl-1 text-[11px] font-bold uppercase tracking-wider text-food-muted">
                  {STATUS_LABEL[status]}
                </span>
                <strong className="block pl-1 text-[28px] leading-none font-extrabold tabular-nums text-food-text">
                  {count}
                </strong>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <section className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft">
          <div className="border-b border-food-border px-5 py-4">
            <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-food-accent">
              Modalidade
            </p>
            <h2 className="m-0 text-base font-bold tracking-tight text-food-text">
              Entrega × retirada na fila
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="rounded-xl border border-food-border bg-food-chip/60 px-3.5 py-3.5">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-food-muted">
                Entrega
              </span>
              <strong className="block text-[28px] leading-none font-extrabold tabular-nums text-food-text">
                {openDelivery}
              </strong>
              <p className="m-0 mt-2 text-[12px] text-food-muted">
                {stats.open ? `${deliveryShare}% da fila` : "Sem pedidos abertos"}
              </p>
            </div>
            <div className="rounded-xl border border-food-border bg-food-chip/60 px-3.5 py-3.5">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-food-muted">
                Retirada
              </span>
              <strong className="block text-[28px] leading-none font-extrabold tabular-nums text-food-text">
                {openPickup}
              </strong>
              <p className="m-0 mt-2 text-[12px] text-food-muted">
                {stats.open ? `${pickupShare}% da fila` : "Sem pedidos abertos"}
              </p>
            </div>
          </div>
          {stats.open > 0 ? (
            <div className="px-4 pb-4">
              <div className="flex h-2 overflow-hidden rounded-full bg-food-chip">
                <div
                  className="bg-food-accent transition-[width]"
                  style={{ width: `${deliveryShare}%` }}
                />
                <div
                  className="bg-sky-400 transition-[width]"
                  style={{ width: `${pickupShare}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] font-semibold text-food-muted">
                <span>Entrega</span>
                <span>Retirada</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft">
          <div className="border-b border-food-border px-5 py-4">
            <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-food-accent">
              Operação
            </p>
            <h2 className="m-0 text-base font-bold tracking-tight text-food-text">
              Status da loja
            </h2>
          </div>
          <ul className="m-0 list-none space-y-0 p-0">
            <li className="flex items-start gap-3 border-b border-food-border px-5 py-3.5">
              <ShopOutlined className="mt-0.5 text-food-accent" />
              <div className="min-w-0">
                <strong className="block text-[13px] text-food-text">
                  {openNow ? "Dentro do horário" : "Fora do horário"}
                </strong>
                <p className="m-0 text-[12px] text-food-muted">{hoursToday}</p>
              </div>
            </li>
            <li className="flex items-start gap-3 border-b border-food-border px-5 py-3.5">
              {health?.whatsapp ? (
                <CheckCircleOutlined className="mt-0.5 text-green-600" />
              ) : (
                <CloseCircleOutlined className="mt-0.5 text-amber-600" />
              )}
              <div className="min-w-0">
                <strong className="block text-[13px] text-food-text">
                  WhatsApp {health?.whatsapp ? "conectado" : "não configurado"}
                </strong>
                <p className="m-0 text-[12px] text-food-muted">
                  Canal pelo qual o bot recebe e responde pedidos
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 border-b border-food-border px-5 py-3.5">
              <ThunderboltOutlined className="mt-0.5 text-food-accent" />
              <div className="min-w-0">
                <strong className="block text-[13px] text-food-text">
                  Aceite {store?.autoAcceptOrders ? "automático" : "manual"}
                </strong>
                <p className="m-0 text-[12px] text-food-muted">
                  {store?.autoAcceptOrders
                    ? `Novos pedidos vão para Aceito (~${store.defaultAcceptMinutes} min)`
                    : "A equipe confirma cada pedido no painel"}
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 px-5 py-3.5">
              <ClockCircleOutlined className="mt-0.5 text-food-accent" />
              <div className="min-w-0">
                <strong className="block text-[13px] text-food-text">
                  Canais ativos
                </strong>
                <p className="m-0 text-[12px] text-food-muted">
                  {[
                    store?.deliveryEnabled ? "Entrega" : null,
                    store?.pickupEnabled ? "Retirada" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Nenhum canal habilitado"}
                </p>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
