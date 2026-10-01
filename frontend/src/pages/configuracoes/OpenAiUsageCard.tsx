import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExportOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Segmented, Skeleton, Tooltip } from "antd";
import { useState } from "react";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";

const BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";
const USAGE_URL = "https://platform.openai.com/usage";

export function formatMoney(value: number, currency: string) {
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (value >= 10_000) return `${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return value.toLocaleString("pt-BR");
}

export function shortDay(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className='min-w-[130px] flex-1 rounded-xl border border-food-border bg-food-chip px-4 py-3'>
      <p className='m-0 text-xs font-medium uppercase tracking-wide text-food-muted'>{label}</p>
      <p className='m-0 mt-1 text-xl font-extrabold tabular-nums tracking-tight text-food-text'>{value}</p>
      {hint ? <p className='m-0 mt-0.5 text-xs text-food-muted'>{hint}</p> : null}
    </div>
  );
}

export function OpenAiUsageCard() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const usageQuery = useQuery({
    queryKey: queryKeys.openAiUsage,
    queryFn: () => api.openAiUsage(),
    staleTime: 5 * 60 * 1000,
    retry: false
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      queryClient.setQueryData(queryKeys.openAiUsage, await api.openAiUsage(true));
    } catch {
      await usageQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "BRL">("USD");
  const rateQuery = useQuery({
    queryKey: queryKeys.usdBrlRate,
    queryFn: api.usdBrlRate,
    enabled: displayCurrency === "BRL",
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const rate = displayCurrency === "BRL" ? rateQuery.data?.rate : undefined;

  const report = usageQuery.data;
  const money = (value: number) =>
    rate && report?.currency.toLowerCase() === "usd"
      ? formatMoney(value * rate, "BRL")
      : formatMoney(value, report?.currency ?? "usd");
  const maxCost = Math.max(0, ...(report?.days ?? []).map(day => day.cost));
  const maxRequests = Math.max(0, ...(report?.days ?? []).map(day => day.requests));

  return (
    <Card
      className='overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-3xl'
      title='Consumo da OpenAI (bot v2)'
      extra={
        report?.configured ? (
          <div className='flex items-center gap-2'>
            <Segmented
              size='small'
              value={displayCurrency}
              onChange={value => setDisplayCurrency(value as "USD" | "BRL")}
              options={[
                { label: "US$", value: "USD" },
                { label: "R$", value: "BRL" },
              ]}
            />
            <Button size='small' icon={<ReloadOutlined />} loading={refreshing} onClick={refresh}>
              Atualizar
            </Button>
          </div>
        ) : null
      }
    >
      {usageQuery.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : usageQuery.isError ? (
        <Alert
          type='error'
          showIcon
          message='Não foi possível consultar a OpenAI.'
          description={usageQuery.error instanceof Error ? usageQuery.error.message : undefined}
        />
      ) : !report?.configured ? (
        <Alert
          type='info'
          showIcon
          message='Configure a Admin Key da OpenAI para ver o consumo aqui.'
          description={
            <span>
              Crie uma chave em <b>platform.openai.com → Settings → Organization → Admin keys</b> e cadastre no Railway
              como <code>OPENAI_ADMIN_KEY</code>. Opcional: <code>OPENAI_PROJECT_ID</code> (proj_...) para mostrar só o
              projeto do bot.
            </span>
          }
        />
      ) : (
        <>
          <p className='mb-4 text-sm leading-normal text-food-muted'>
            Mês atual ({shortDay(report.from)} a {shortDay(report.to)}, horário UTC, igual ao painel da OpenAI)
            {report.projectId ? " · só o projeto do bot" : " · toda a organização"}. Os valores podem levar alguns
            minutos para aparecer.
          </p>

          {displayCurrency === "BRL" ? (
            <p className='-mt-2 mb-4 text-xs text-food-muted'>
              {rateQuery.isPending
                ? "Buscando cotação do dólar…"
                : rateQuery.isError || !rateQuery.data
                  ? "Cotação do dólar indisponível no momento. Valores em US$."
                  : `Convertido pela cotação de hoje: US$ 1 = ${formatMoney(rateQuery.data.rate, "BRL")} (${rateQuery.data.source}). Valor aproximado; a fatura da OpenAI é em dólar.`}
            </p>
          ) : null}

          <div className='mb-5 flex flex-wrap gap-3'>
            <Stat label='Gasto no mês' value={money(report.totalCost)} />
            <Stat label='Hoje' value={money(report.todayCost)} />
            <Stat
              label='Requisições'
              value={formatCount(report.totals.requests)}
              hint={
                report.totals.requests
                  ? `≈ ${money(report.totalCost / report.totals.requests)} cada`
                  : undefined
              }
            />
            <Stat
              label='Tokens'
              value={formatCount(report.totals.inputTokens + report.totals.outputTokens)}
              hint={`${formatCount(report.totals.inputTokens)} entrada · ${formatCount(report.totals.outputTokens)} saída`}
            />
          </div>

          {report.days.length ? (
            <>
              <h3 className='m-0 mb-2 text-sm font-bold text-food-text'>Por dia</h3>
              <div className='mb-5 flex h-28 items-end gap-1 overflow-x-auto rounded-xl border border-food-border px-3 pb-2 pt-3'>
                {report.days.map(day => {
                  const ratio = maxCost > 0 ? day.cost / maxCost : maxRequests > 0 ? day.requests / maxRequests : 0;
                  return (
                    <Tooltip
                      key={day.date}
                      title={`${shortDay(day.date)} · ${money(day.cost)} · ${day.requests} req.`}
                    >
                      <div className='flex h-full min-w-[14px] flex-1 flex-col items-center justify-end gap-1'>
                        <div
                          className='w-full rounded-t bg-food-accent'
                          style={{
                            height: `${Math.max(ratio * 100, day.requests || day.cost ? 4 : 1)}%`,
                            opacity: day.requests || day.cost ? 1 : 0.25
                          }}
                        />
                        <span className='text-[10px] tabular-nums text-food-muted'>{day.date.slice(8)}</span>
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            </>
          ) : null}

          {report.models.length ? (
            <>
              <h3 className='m-0 mb-2 text-sm font-bold text-food-text'>Por modelo</h3>
              <div className='mb-5 overflow-hidden rounded-xl border border-food-border'>
                {report.models.map((model, index) => (
                  <div
                    key={model.model}
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm ${index ? "border-t border-food-border" : ""}`}
                  >
                    <span className='font-semibold text-food-text'>{model.model}</span>
                    <span className='tabular-nums text-food-muted'>
                      {model.requests.toLocaleString("pt-BR")} req. ·{" "}
                      {formatCount(model.inputTokens + model.outputTokens)} tokens
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className='mb-5 text-sm text-food-muted'>Nenhuma chamada registrada neste mês ainda.</p>
          )}

          <Alert
            type='info'
            showIcon
            className='mb-3'
            message='Saldo de créditos e recarga não são disponibilizados pela API da OpenAI.'
            description='Créditos pré-pagos não renovam (vencem 1 ano após a compra). Confira o saldo e a recarga automática no painel de Billing.'
          />
          <div className='flex flex-wrap gap-2 mt-3'>
            <Button icon={<ExportOutlined />} href={BILLING_URL} target='_blank' rel='noreferrer'>
              Saldo e recarga
            </Button>
            <Button icon={<ExportOutlined />} href={USAGE_URL} target='_blank' rel='noreferrer'>
              Painel de uso
            </Button>
          </div>
          <p className='m-0 mt-3 text-xs text-food-muted'>
            Atualizado às{" "}
            {new Date(report.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </>
      )}
    </Card>
  );
}
