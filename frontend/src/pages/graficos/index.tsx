import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Spin, Tag, message } from "antd";
import { CopyOutlined, MessageOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { formatPhoneDisplay, STATUS_LABEL } from "../../lib/format";
import { queryKeys } from "../../lib/queryKeys";
import { listPage } from "../../ui";
import type { BotInterventionItem, BotPerformanceReport, OrderStatus } from "../../types";

type Slice = { key: string; label: string; hint: string; value: number; color: string };

function slicesFor(report: BotPerformanceReport): Slice[] {
  return [
    {
      key: "bot",
      label: "Feitos só pelo bot",
      hint: "Chegaram a Aceito sem ninguém assumir",
      value: report.botOnly,
      color: "#22c55e"
    },
    {
      key: "human",
      label: "Com intervenção",
      hint: "O atendente clicou em Assumir",
      value: report.humanAssisted,
      color: "#8b5cf6"
    },
    {
      key: "other",
      label: "Aguardando / cancelados",
      hint: "Ainda em Recebido ou cancelados",
      value: report.other,
      color: "#a1a1aa"
    }
  ];
}

const RADIUS = 70;
const STROKE = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function PieChart({ slices, total }: { slices: Slice[]; total: number }) {
  let offset = 0;
  return (
    <svg viewBox='0 0 200 200' className='size-full max-w-[260px]' role='img' aria-label={`${total} pedidos no dia`}>
      <circle cx='100' cy='100' r={RADIUS} fill='none' stroke='currentColor' strokeWidth={STROKE} className='text-food-border' />
      {total > 0
        ? slices.map(slice => {
            if (!slice.value) return null;
            const length = (slice.value / total) * CIRCUMFERENCE;
            const circle = (
              <circle
                key={slice.key}
                cx='100'
                cy='100'
                r={RADIUS}
                fill='none'
                stroke={slice.color}
                strokeWidth={STROKE}
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-offset}
                transform='rotate(-90 100 100)'
              >
                <title>{`${slice.label}: ${slice.value}`}</title>
              </circle>
            );
            offset += length;
            return circle;
          })
        : null}
      <text x='100' y='96' textAnchor='middle' className='fill-food-text text-[34px] font-extrabold tabular-nums'>
        {total}
      </text>
      <text x='100' y='120' textAnchor='middle' className='fill-food-muted text-[12px]'>
        {total === 1 ? "pedido" : "pedidos"}
      </text>
    </svg>
  );
}

function percent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function orderStatusLabel(status: string | null) {
  if (!status) return null;
  return STATUS_LABEL[status as OrderStatus] ?? status;
}

async function copyPhone(phone: string) {
  try {
    await navigator.clipboard.writeText(phone);
    message.success("Telefone copiado");
  } catch {
    message.error("Não foi possível copiar");
  }
}

function InterventionRow({ item }: { item: BotInterventionItem }) {
  const phoneLabel = formatPhoneDisplay(item.phone) || item.phone;
  const statusLabel = orderStatusLabel(item.orderStatus);
  const conversasTo = `/conversas?phone=${encodeURIComponent(item.phone)}`;

  return (
    <li className='flex flex-col gap-2 rounded-lg border border-food-border px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='m-0 text-sm font-semibold tabular-nums text-food-text'>{phoneLabel}</p>
          {item.orderCode ? (
            <Tag className='!m-0' color='purple'>
              #{item.orderCode}
            </Tag>
          ) : (
            <Tag className='!m-0'>Sem pedido</Tag>
          )}
          {statusLabel ? <span className='text-xs text-food-muted'>{statusLabel}</span> : null}
        </div>
        <p className='m-0 mt-0.5 truncate text-xs text-food-muted'>
          {[item.customerName?.trim() || null, item.handoffBy ? `Atendente: ${item.handoffBy}` : null, dayjs(item.at).format("HH:mm")]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-1.5'>
        <Button
          type='text'
          size='small'
          icon={<CopyOutlined />}
          aria-label={`Copiar telefone ${phoneLabel}`}
          onClick={() => void copyPhone(item.phone)}
        />
        <Link to={conversasTo}>
          <Button type='default' size='small' icon={<MessageOutlined />}>
            Conversas
          </Button>
        </Link>
      </div>
    </li>
  );
}

export function BotChartsPage() {
  const [day, setDay] = useState<Dayjs>(() => dayjs().startOf("day"));
  const dayKey = day.format("YYYY-MM-DD");

  const reportQuery = useQuery({
    queryKey: queryKeys.orders.botPerformance(dayKey),
    queryFn: () => api.botPerformanceReport(dayKey),
    refetchInterval: 60_000
  });
  const report = reportQuery.data;
  const slices = report ? slicesFor(report) : [];
  const interventions = report?.interventions ?? [];

  return (
    <div className={cn(listPage, "min-w-0 max-w-full")}>
      <PageHeader
        kicker='Gráficos'
        title='Desempenho do bot'
        subtitle='Pedidos do dia no WhatsApp: quantos o bot fechou sozinho e quantos precisaram do atendente.'
        extra={
          <DatePicker
            allowClear={false}
            value={day}
            format='DD/MM/YYYY'
            inputReadOnly
            disabledDate={current => current.isAfter(dayjs().endOf("day"))}
            onChange={value => value && setDay(value.startOf("day"))}
          />
        }
      />

      {report && !report.tracking ? (
        <Alert
          className='mb-4'
          type='warning'
          showIcon
          message='Rode a migration 056_order_human_assisted.sql no Supabase para contar as intervenções do atendente.'
        />
      ) : null}

      <section className='rounded-xl border border-food-border bg-food-surface p-5 max-lg:p-4'>
        <h2 className='m-0 text-base font-bold text-food-text'>Pedidos do dia · bot × atendente</h2>
        <p className='m-0 mt-0.5 text-xs text-food-muted'>
          Intervenção = o atendente clicou em Assumir (ou respondeu pelo chat) durante o pedido.
        </p>

        {reportQuery.isLoading ? (
          <div className='flex justify-center py-12'>
            <Spin />
          </div>
        ) : reportQuery.error ? (
          <Alert
            className='mt-4'
            type='error'
            showIcon
            message={reportQuery.error instanceof Error ? reportQuery.error.message : "Falha ao carregar o gráfico."}
          />
        ) : !report?.total && !interventions.length ? (
          <Empty className='py-10' description='Nenhum pedido neste dia.' image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className='mt-4 grid items-center gap-6 md:grid-cols-[minmax(0,260px)_1fr]'>
            <div className='flex justify-center'>
              <PieChart slices={slices} total={report?.total ?? 0} />
            </div>
            <ul className='m-0 flex list-none flex-col gap-2 p-0'>
              {slices.map(slice => (
                <li
                  key={slice.key}
                  className='flex items-center justify-between gap-3 rounded-lg border border-food-border px-3.5 py-2.5'
                >
                  <div className='flex min-w-0 items-center gap-2.5'>
                    <span className='size-3 shrink-0 rounded-full' style={{ background: slice.color }} aria-hidden='true' />
                    <div className='min-w-0'>
                      <p className='m-0 text-sm font-semibold text-food-text'>{slice.label}</p>
                      <p className='m-0 text-xs text-food-muted'>{slice.hint}</p>
                    </div>
                  </div>
                  <div className='shrink-0 text-right'>
                    <strong className='block text-lg tabular-nums text-food-text'>{slice.value}</strong>
                    <span className='text-xs tabular-nums text-food-muted'>
                      {percent(slice.value, report?.total ?? 0)}
                    </span>
                  </div>
                </li>
              ))}
              <li className='flex items-center justify-between gap-3 px-3.5 pt-1 text-sm'>
                <span className='font-semibold text-food-muted'>Total de pedidos no WhatsApp</span>
                <strong className='tabular-nums text-food-text'>{report?.total ?? 0}</strong>
              </li>
            </ul>
          </div>
        )}
      </section>

      {report?.tracking ? (
        <section className='mt-4 rounded-xl border border-food-border bg-food-surface p-5 max-lg:p-4'>
          <h2 className='m-0 text-base font-bold text-food-text'>Intervenções do dia</h2>
          <p className='m-0 mt-0.5 text-xs text-food-muted'>
            Consulte pelo telefone (o nome do Zap pode diferir do contato salvo no celular).
          </p>

          {reportQuery.isLoading ? (
            <div className='flex justify-center py-10'>
              <Spin />
            </div>
          ) : !interventions.length ? (
            <Empty
              className='py-8'
              description='Nenhuma intervenção neste dia.'
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <ul className='m-0 mt-4 flex list-none flex-col gap-2 p-0'>
              {interventions.map(item => (
                <InterventionRow key={`${item.phone}-${item.orderId ?? item.conversationId ?? item.at}`} item={item} />
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
