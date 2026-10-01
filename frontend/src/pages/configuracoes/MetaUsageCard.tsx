import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExportOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Skeleton, Tooltip } from "antd";
import { useState } from "react";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { Stat, formatCount, formatMoney, shortDay } from "./OpenAiUsageCard";

const INSIGHTS_URL = "https://business.facebook.com/wa/manage/phone-numbers/";
const BILLING_URL = "https://business.facebook.com/billing_hub/accounts";

const CATEGORY_LABEL: Record<string, string> = {
  SERVICE: "Atendimento (respostas ao cliente)",
  MARKETING: "Marketing (campanhas)",
  MARKETING_LITE: "Marketing Lite",
  UTILITY: "Utilidade (avisos fora da janela)",
  AUTHENTICATION: "Autenticação (códigos)",
  AUTHENTICATION_INTERNATIONAL: "Autenticação internacional",
  REFERRAL_CONVERSION: "Entrada gratuita (anúncios)",
};

export function MetaUsageCard() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const usageQuery = useQuery({
    queryKey: queryKeys.metaUsage,
    queryFn: () => api.metaUsage(),
    staleTime: 5 * 60 * 1000,
    retry: false
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      queryClient.setQueryData(queryKeys.metaUsage, await api.metaUsage(true));
    } catch {
      await usageQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const report = usageQuery.data;
  const money = (value: number) => formatMoney(value, report?.currency ?? "BRL");
  const maxVolume = Math.max(0, ...(report?.days ?? []).map(day => day.volume));

  return (
    <Card
      className='overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-3xl'
      title='Consumo da Meta (WhatsApp)'
      extra={
        report?.configured ? (
          <Button size='small' icon={<ReloadOutlined />} loading={refreshing} onClick={refresh}>
            Atualizar
          </Button>
        ) : null
      }
    >
      {usageQuery.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : usageQuery.isError ? (
        <Alert
          type='error'
          showIcon
          message='Não foi possível consultar a Meta.'
          description={usageQuery.error instanceof Error ? usageQuery.error.message : undefined}
        />
      ) : !report?.configured ? (
        <Alert
          type='info'
          showIcon
          message='Configure o WhatsApp para ver o consumo aqui.'
          description={
            <span>
              Cadastre no Railway <code>WHATSAPP_TOKEN</code> (com a permissão <b>whatsapp_business_management</b>) e{" "}
              <code>WHATSAPP_WABA_ID</code> (ID da conta do WhatsApp Business).
            </span>
          }
        />
      ) : (
        <>
          <p className='mb-4 text-sm leading-normal text-food-muted'>
            Mês atual ({shortDay(report.from)} a {shortDay(report.to)}). Mensagens <b>entregues</b> pelo número e custo
            aproximado informado pela Meta; o valor oficial é o da fatura.
          </p>

          <div className='mb-5 flex flex-wrap gap-3'>
            <Stat label='Gasto no mês' value={money(report.totalCost)} />
            <Stat label='Mensagens' value={formatCount(report.totals.volume)} hint='entregues no mês' />
            <Stat label='Grátis' value={formatCount(report.totals.freeVolume)} hint='atendimento em até 24h' />
            <Stat label='Pagas' value={formatCount(report.totals.paidVolume)} />
          </div>

          {report.days.length ? (
            <>
              <h3 className='m-0 mb-2 text-sm font-bold text-food-text'>Mensagens por dia</h3>
              <div className='mb-5 flex h-28 items-end gap-1 overflow-x-auto rounded-xl border border-food-border px-3 pb-2 pt-3'>
                {report.days.map(day => {
                  const ratio = maxVolume > 0 ? day.volume / maxVolume : 0;
                  return (
                    <Tooltip
                      key={day.date}
                      title={`${shortDay(day.date)} · ${day.volume} msg. (${day.paidVolume} pagas) · ${money(day.cost)}`}
                    >
                      <div className='flex h-full min-w-[14px] flex-1 flex-col items-center justify-end gap-1'>
                        <div
                          className='w-full rounded-t bg-food-accent'
                          style={{
                            height: `${Math.max(ratio * 100, day.volume ? 4 : 1)}%`,
                            opacity: day.volume ? 1 : 0.25
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

          {report.categories.length ? (
            <>
              <h3 className='m-0 mb-2 text-sm font-bold text-food-text'>Por categoria</h3>
              <div className='mb-5 overflow-hidden rounded-xl border border-food-border'>
                {report.categories.map((item, index) => (
                  <div
                    key={item.category}
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm ${index ? "border-t border-food-border" : ""}`}
                  >
                    <span className='font-semibold text-food-text'>{CATEGORY_LABEL[item.category] ?? item.category}</span>
                    <span className='tabular-nums text-food-muted'>
                      {item.volume.toLocaleString("pt-BR")} msg.
                      {item.paidVolume ? ` (${item.paidVolume.toLocaleString("pt-BR")} pagas)` : " · grátis"} ·{" "}
                      {money(item.cost)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className='mb-5 text-sm text-food-muted'>Nenhuma mensagem entregue neste mês ainda.</p>
          )}

          <Alert
            type='info'
            showIcon
            className='mb-3'
            message='Respostas do bot dentro de 24h após a mensagem do cliente são gratuitas.'
            description='Só geram custo mensagens iniciadas pela loja fora dessa janela: campanhas (marketing), avisos (utilidade) e códigos (autenticação).'
          />
          <div className='mt-3 flex flex-wrap gap-2'>
            <Button icon={<ExportOutlined />} href={INSIGHTS_URL} target='_blank' rel='noreferrer'>
              WhatsApp Manager
            </Button>
            <Button icon={<ExportOutlined />} href={BILLING_URL} target='_blank' rel='noreferrer'>
              Faturamento
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
