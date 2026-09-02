import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DatePicker } from "antd";
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  FireOutlined,
  RocketOutlined,
  ShopOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { HeaderSkeleton, StatCardsSkeleton } from "../../components/PageSkeletons";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../lib/api";
import { STATUS_LABEL } from "../../lib/format";
import { isStoreOpenNow, todayHoursLabel } from "../../lib/hours";
import { queryKeys } from "../../lib/queryKeys";
import { cn } from "../../lib/cn";
import type { OrderStats, OrderStatus } from "../../types";

const SUBTITLE_SUFFIX =
  "fila da cozinha e ritmo do dia — sem valores financeiros nesta tela.";

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
  const byStatus = raw.byStatus
    ? { ...EMPTY_BY_STATUS, ...raw.byStatus }
    : { ...EMPTY_BY_STATUS };
  return {
    day: raw.day,
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

function formatDayLabel(day: string, isToday: boolean) {
  if (isToday) return "Hoje";
  const parsed = dayjs(day, "YYYY-MM-DD");
  return parsed.isValid() ? parsed.format("DD/MM/YYYY") : day;
}

const PIPELINE = [
  "received",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
] as const satisfies readonly OrderStatus[];

type PipelineKey = (typeof PIPELINE)[number];

const PIPELINE_META: Record<
  PipelineKey,
  { bar: string; glow: string; ink: string }
> = {
  received: {
    bar: "bg-food-accent",
    glow: "from-food-accent/25 via-food-accent/5 to-transparent",
    ink: "text-food-accent",
  },
  accepted: {
    bar: "bg-blue-500",
    glow: "from-blue-500/25 via-blue-500/5 to-transparent",
    ink: "text-blue-500",
  },
  preparing: {
    bar: "bg-amber-500",
    glow: "from-amber-500/25 via-amber-500/5 to-transparent",
    ink: "text-amber-500",
  },
  ready: {
    bar: "bg-emerald-500",
    glow: "from-emerald-500/25 via-emerald-500/5 to-transparent",
    ink: "text-emerald-500",
  },
  out_for_delivery: {
    bar: "bg-sky-500",
    glow: "from-sky-500/25 via-sky-500/5 to-transparent",
    ink: "text-sky-500",
  },
};

function formatWait(minutes: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function urgencyTone(minutes: number | null, open: number) {
  if (!open || minutes == null) return "calm" as const;
  if (minutes >= 45) return "hot" as const;
  if (minutes >= 20) return "warm" as const;
  return "calm" as const;
}

function StatusPill({
  ok,
  okLabel,
  badLabel,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide",
        ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          ok ? "bg-emerald-500 animate-pulse" : "bg-amber-500",
        )}
      />
      {ok ? okLabel : badLabel}
    </span>
  );
}

function DayMetric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: "orange" | "emerald" | "rose" | "zinc";
}) {
  const accents = {
    orange: "text-food-accent",
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    zinc: "text-food-text",
  };
  return (
    <div className="min-w-0 flex-1 border-l border-food-border/80 pl-4 first:border-l-0 first:pl-0 max-sm:border-l-0 max-sm:border-t max-sm:pl-0 max-sm:pt-3 first:max-sm:border-t-0 first:max-sm:pt-0">
      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-food-muted">
        {label}
      </p>
      <p
        className={cn(
          "m-0 mt-1 text-[2rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums",
          accents[accent ?? "zinc"],
        )}
      >
        {value}
      </p>
      <p className="m-0 mt-1.5 text-[12px] leading-snug text-food-muted">{hint}</p>
    </div>
  );
}

export function DashboardPage() {
  const [day, setDay] = useState(() => dayjs());
  const dayKey = day.format("YYYY-MM-DD");
  const isSelectedToday = dayKey === dayjs().format("YYYY-MM-DD");

  const storeQuery = useQuery({
    queryKey: queryKeys.store,
    queryFn: api.store,
  });
  const statsQuery = useQuery({
    queryKey: queryKeys.stats(dayKey),
    queryFn: () => api.orderStats(dayKey),
    placeholderData: keepPreviousData,
    refetchInterval: isSelectedToday ? 30_000 : false,
  });
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
    refetchInterval: 60_000,
  });

  const loading =
    (storeQuery.isPending && !storeQuery.data) ||
    (statsQuery.isPending && !statsQuery.data);
  const store = storeQuery.data;
  const stats = normalizeStats(statsQuery.data);
  const health = healthQuery.data;
  const title = store?.name ?? "Estabelecimento";
  const subtitle = `Segmento: ${store?.segment ?? "food"} · ${SUBTITLE_SUFFIX}`;
  const dayLabel = useMemo(
    () => formatDayLabel(stats.day ?? dayKey, isSelectedToday),
    [stats.day, dayKey, isSelectedToday],
  );

  function onDayChange(value: Dayjs | null) {
    setDay(value?.isValid() ? value.startOf("day") : dayjs());
  }

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
  const dayDelivery = stats.openByFulfillment.delivery;
  const dayPickup = stats.openByFulfillment.pickup;
  const dayOrders = stats.today.created;
  const deliveryShare =
    dayOrders > 0 ? Math.round((dayDelivery / dayOrders) * 100) : 0;
  const pickupShare = dayOrders > 0 ? 100 - deliveryShare : 0;
  const urgency = urgencyTone(stats.oldestOpenMinutes, stats.open);
  const pipelineTotal = PIPELINE.reduce(
    (sum, status) => sum + (stats.byStatus[status] ?? 0),
    0,
  );

  return (
    <div className="flex min-h-full flex-col gap-6">
      <PageHeader
        className="mb-0"
        kicker="Cozinha"
        title={title}
        subtitle={subtitle}
        titleExtra={
          <DatePicker
            allowClear={false}
            format="DD/MM/YYYY"
            value={day}
            onChange={onDayChange}
            disabledDate={(current) =>
              Boolean(current && current.isAfter(dayjs(), "day"))
            }
            className="w-[148px]"
            placeholder="Data"
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill
          ok={openNow}
          okLabel="Aberto agora"
          badLabel="Fora do horário"
        />
        <StatusPill
          ok={Boolean(health?.whatsapp)}
          okLabel="WhatsApp ok"
          badLabel="WhatsApp pendente"
        />
        <StatusPill
          ok={Boolean(store?.autoAcceptOrders)}
          okLabel="Aceite automático"
          badLabel="Aceite manual"
        />
      </div>

      {/* Passagem principal: fila em destaque + métricas do dia */}
      <section className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.85fr)] gap-4 max-xl:grid-cols-1">
        <article
          className={cn(
            "relative overflow-hidden rounded-[22px] border p-5 shadow-food-soft",
            "bg-food-surface",
            urgency === "hot" &&
              "border-rose-500/40 shadow-[0_0_0_1px_rgba(244,63,94,0.12),0_16px_40px_rgba(244,63,94,0.12)]",
            urgency === "warm" && "border-amber-500/35",
            urgency === "calm" && "border-food-accent/40",
          )}
        >
          <div
            className={cn(
              "pointer-events-none absolute -top-16 -right-10 size-56 rounded-full blur-3xl",
              urgency === "hot" && "bg-rose-500/20",
              urgency === "warm" && "bg-amber-500/15",
              urgency === "calm" && "bg-food-accent/20",
            )}
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-food-muted">
                Na passagem
              </p>
              <h2 className="m-0 mt-1 text-lg font-extrabold tracking-tight text-food-text">
                Pedidos na fila
              </h2>
            </div>
            <span
              className={cn(
                "inline-flex size-10 items-center justify-center rounded-2xl",
                urgency === "hot" && "bg-rose-500/15 text-rose-500",
                urgency === "warm" && "bg-amber-500/15 text-amber-500",
                urgency === "calm" && "bg-food-accent/15 text-food-accent",
              )}
            >
              <FireOutlined className="text-lg" />
            </span>
          </div>
          <p
            className={cn(
              "relative m-0 mt-4 text-[4.5rem] font-extrabold leading-none tracking-[-0.06em] tabular-nums",
              urgency === "hot" && "text-rose-500",
              urgency === "warm" && "text-amber-500",
              urgency === "calm" && "text-food-text",
            )}
          >
            {stats.open}
          </p>
          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
                stats.open > 0
                  ? "bg-food-chip text-food-text"
                  : "bg-food-chip/70 text-food-muted",
              )}
            >
              <ClockCircleOutlined />
              {stats.open > 0 && stats.oldestOpenMinutes != null
                ? `Mais antigo · ${formatWait(stats.oldestOpenMinutes)}`
                : isSelectedToday
                  ? "Fila vazia — boa hora pra organizar"
                  : `Nenhum pedido aberto em ${dayLabel}`}
            </span>
            {urgency === "hot" && isSelectedToday ? (
              <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[12px] font-bold text-rose-500">
                Intervir
              </span>
            ) : null}
            {!isSelectedToday ? (
              <span className="rounded-full bg-food-chip px-2.5 py-1 text-[12px] font-semibold text-food-muted">
                {dayLabel}
              </span>
            ) : null}
          </div>
        </article>

        <article className="relative overflow-hidden rounded-[22px] border border-food-border bg-food-surface p-5 shadow-food-soft">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-food-accent/50 to-transparent" />
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-food-accent">
                Ritmo do dia
              </p>
              <h2 className="m-0 mt-1 text-lg font-extrabold tracking-tight text-food-text">
                {isSelectedToday ? "Hoje na operação" : `Operação · ${dayLabel}`}
              </h2>
            </div>
            <p className="m-0 text-[12px] font-medium text-food-muted">
              {isSelectedToday ? hoursToday : dayLabel}
            </p>
          </div>
          <div className="flex gap-0 max-sm:flex-col">
            <DayMetric
              label="Novos"
              value={stats.today.created}
              hint={`${stats.today.open} ainda na fila`}
              accent="orange"
            />
            <DayMetric
              label="Entregues"
              value={stats.today.delivered}
              hint={
                stats.avgPrepMinutesToday != null
                  ? `Preparo médio ${stats.avgPrepMinutesToday} min`
                  : "Sem tempo registrado"
              }
              accent="emerald"
            />
            <DayMetric
              label="Cancelados"
              value={stats.today.cancelled}
              hint={
                stats.today.cancelled
                  ? "Vale olhar o motivo"
                  : "Nenhum cancelamento"
              }
              accent={stats.today.cancelled ? "rose" : "zinc"}
            />
          </div>
        </article>
      </section>

      {/* Trilho da comanda — sequência real da cozinha */}
      <section className="overflow-hidden rounded-[22px] border border-food-border bg-food-surface shadow-food-soft">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-food-border px-5 py-4">
          <div>
            <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-food-accent">
              Passagem
            </p>
            <h2 className="m-0 text-lg font-extrabold tracking-tight text-food-text">
              Pedidos por status
            </h2>
            <p className="m-0 mt-1 text-[12px] text-food-muted">
              {pipelineTotal
                ? `${pipelineTotal} na linha · da esquerda pra direita`
                : "Nenhum pedido na linha agora"}
            </p>
          </div>
          <Link
            to="/pedidos"
            className="inline-flex items-center gap-1.5 rounded-full border border-food-accent/30 bg-food-accent/10 px-3 py-1.5 text-[13px] font-bold text-food-accent no-underline transition-colors hover:bg-food-accent/15"
          >
            Abrir pedidos
            <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="grid grid-cols-5 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {PIPELINE.map((status, index) => {
            const count = stats.byStatus[status] ?? 0;
            const meta = PIPELINE_META[status];
            const active = count > 0;
            return (
              <div
                key={status}
                className={cn(
                  "relative min-h-[8.5rem] border-food-border p-4 transition-colors",
                  index < PIPELINE.length - 1 && "border-r max-lg:border-r-0",
                  "max-lg:border-b max-sm:border-b",
                  index >= PIPELINE.length - 1 && "max-lg:border-b-0",
                  !active && "opacity-55",
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b",
                    meta.glow,
                    !active && "opacity-40",
                  )}
                />
                <div className="relative flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-bold uppercase tracking-[0.12em]",
                      active ? meta.ink : "text-food-muted",
                    )}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      meta.bar,
                      active ? "opacity-100" : "opacity-30",
                    )}
                  />
                </div>
                <p
                  className={cn(
                    "relative m-0 mt-5 text-[2.75rem] font-extrabold leading-none tracking-[-0.05em] tabular-nums",
                    active ? "text-food-text" : "text-food-muted",
                  )}
                >
                  {count}
                </p>
                {index < PIPELINE.length - 1 ? (
                  <span
                    className="pointer-events-none absolute top-1/2 -right-2 z-10 hidden -translate-y-1/2 text-food-border max-lg:hidden"
                    aria-hidden
                  >
                    ›
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        {/* Modalidade — ticket bipartido */}
        <section className="overflow-hidden rounded-[22px] border border-food-border bg-food-surface shadow-food-soft">
          <div className="border-b border-food-border px-5 py-4">
            <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-food-accent">
              Modalidade
            </p>
            <h2 className="m-0 text-lg font-extrabold tracking-tight text-food-text">
              Entrega × retirada
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-px bg-food-border">
            <div className="bg-food-surface p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-food-accent/15 text-food-accent">
                  <RocketOutlined />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-food-muted">
                  Entrega
                </span>
              </div>
              <p className="m-0 mt-4 text-[2.5rem] font-extrabold leading-none tracking-[-0.05em] tabular-nums text-food-text">
                {dayDelivery}
              </p>
              <p className="m-0 mt-2 text-[12px] font-semibold text-food-accent">
                {dayOrders ? `${deliveryShare}% do dia` : "Sem pedidos no dia"}
              </p>
            </div>
            <div className="bg-food-surface p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-violet-500/15 text-violet-500">
                  <ShopOutlined />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-food-muted">
                  Retirada
                </span>
              </div>
              <p className="m-0 mt-4 text-[2.5rem] font-extrabold leading-none tracking-[-0.05em] tabular-nums text-food-text">
                {dayPickup}
              </p>
              <p className="m-0 mt-2 text-[12px] font-semibold text-violet-500">
                {dayOrders ? `${pickupShare}% do dia` : "Sem pedidos no dia"}
              </p>
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-food-chip">
              <div
                className="bg-food-accent transition-[width] duration-500"
                style={{ width: dayOrders ? `${deliveryShare}%` : "50%" }}
              />
              <div
                className="bg-violet-500 transition-[width] duration-500"
                style={{ width: dayOrders ? `${pickupShare}%` : "50%" }}
              />
            </div>
            <div className="mt-2.5 flex justify-between text-[11px] font-bold text-food-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-food-accent" />
                Entrega
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-violet-500" />
                Retirada
              </span>
            </div>
          </div>
        </section>

        {/* Operação — grade de sensores */}
        <section className="overflow-hidden rounded-[22px] border border-food-border bg-food-surface shadow-food-soft">
          <div className="border-b border-food-border px-5 py-4">
            <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-food-accent">
              Operação
            </p>
            <h2 className="m-0 text-lg font-extrabold tracking-tight text-food-text">
              Status da loja
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 max-sm:grid-cols-1">
            <div className="rounded-2xl border border-food-border bg-food-chip/50 p-3.5">
              <div className="flex items-center gap-2 text-food-accent">
                <ShopOutlined />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-food-muted">
                  Horário
                </span>
              </div>
              <p className="m-0 mt-2 text-[14px] font-bold text-food-text">
                {openNow ? "Dentro do horário" : "Fora do horário"}
              </p>
              <p className="m-0 mt-0.5 text-[12px] text-food-muted">{hoursToday}</p>
            </div>
            <div className="rounded-2xl border border-food-border bg-food-chip/50 p-3.5">
              <div className="flex items-center gap-2">
                {health?.whatsapp ? (
                  <CheckCircleFilled className="text-emerald-500" />
                ) : (
                  <CloseCircleFilled className="text-amber-500" />
                )}
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-food-muted">
                  WhatsApp
                </span>
              </div>
              <p className="m-0 mt-2 text-[14px] font-bold text-food-text">
                {health?.whatsapp ? "Conectado" : "Não configurado"}
              </p>
              <p className="m-0 mt-0.5 text-[12px] text-food-muted">
                Canal dos pedidos
              </p>
            </div>
            <div className="rounded-2xl border border-food-border bg-food-chip/50 p-3.5">
              <div className="flex items-center gap-2 text-food-accent">
                <ThunderboltOutlined />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-food-muted">
                  Aceite
                </span>
              </div>
              <p className="m-0 mt-2 text-[14px] font-bold text-food-text">
                {store?.autoAcceptOrders ? "Automático" : "Manual"}
              </p>
              <p className="m-0 mt-0.5 text-[12px] text-food-muted">
                {store?.autoAcceptOrders
                  ? `~${store.defaultAcceptMinutes} min`
                  : "Confirma no painel"}
              </p>
            </div>
            <div className="rounded-2xl border border-food-border bg-food-chip/50 p-3.5">
              <div className="flex items-center gap-2 text-food-accent">
                <ClockCircleOutlined />
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-food-muted">
                  Canais
                </span>
              </div>
              <p className="m-0 mt-2 text-[14px] font-bold text-food-text">
                {[
                  store?.deliveryEnabled ? "Entrega" : null,
                  store?.pickupEnabled ? "Retirada" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Nenhum"}
              </p>
              <p className="m-0 mt-0.5 text-[12px] text-food-muted">
                Habilitados no bot
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
