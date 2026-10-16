import { useMemo, useState } from "react";
import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, InputNumber, Tabs, Tag } from "antd";
import { FormControl } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { SettingsSkeleton } from "../../components/PageSkeletons";
import { api } from "../../lib/api";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import {
  botSettingsSchema,
  type BotSettingsValues,
} from "../../lib/validation";
import { NeighborhoodFees } from "./NeighborhoodFees";
import { BrandingCard } from "./BrandingCard";
import { ReceiptSettingsCard } from "./ReceiptSettingsCard";
import { PrinterSettingsCard } from "./PrinterSettingsCard";
import { PrepSettingsCard } from "./PrepSettingsCard";
import { BatchCategorySettingsCard } from "./BatchCategorySettingsCard";
import { BotFlowSettingsCard } from "./BotFlowSettingsCard";
import { MetaUsageCard } from "./MetaUsageCard";
import { OpenAiUsageCard } from "./OpenAiUsageCard";

function formatIdleLabel(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 1) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return hours === 1 ? "1 hora" : `${hours} horas`;
  return `${hours} h ${rest} min`;
}

type SettingsTab =
  | "perfil"
  | "bot"
  | "pedidos"
  | "impressao"
  | "entrega"
  | "uso";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>("perfil");
  const storeQuery = useQuery({
    queryKey: queryKeys.store,
    queryFn: api.store,
  });
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
  });

  const saveMutation = useMutation({
    mutationFn: (values: BotSettingsValues) =>
      api.updateStore({ idleTimeoutMinutes: Number(values.idleTimeoutMinutes) }),
    onSuccess: async () => {
      toast.success("Configurações salvas.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

  const loading = storeQuery.isPending || healthQuery.isPending;

  const store = storeQuery.data;
  const health = healthQuery.data;
  const initialValues: BotSettingsValues = {
    idleTimeoutMinutes: store?.idleTimeoutMinutes ?? 60,
  };

  const tabItems = useMemo(
    () => [
      { key: "perfil", label: "Perfil" },
      { key: "bot", label: "Bot WhatsApp" },
      { key: "pedidos", label: "Pedidos" },
      { key: "impressao", label: "Cupom e impressão" },
      { key: "entrega", label: "Entrega" },
      { key: "uso", label: "Uso e status" },
    ],
    [],
  );

  if (loading) {
    return <SettingsSkeleton />;
  }

  return (
    <>
      <PageHeader
        kicker="Retaguarda"
        title="Configurações"
        subtitle="Perfil no WhatsApp, fluxo do bot, preparo, cupom, impressão, taxas de entrega e consumo."
      />

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as SettingsTab)}
        items={tabItems}
        className="mb-4 [&_.ant-tabs-nav]:mb-0"
      />

      <div className="flex flex-col gap-6">
        {tab === "perfil" ? (
          <BrandingCard store={store} whatsappReady={health?.whatsapp} />
        ) : null}

        {tab === "bot" ? (
          <>
            <BotFlowSettingsCard store={store} />
            <BatchCategorySettingsCard store={store} />
            <Card
              className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft"
              title="Tempo sem resposta"
            >
              <Formik
                enableReinitialize
                initialValues={initialValues}
                validationSchema={botSettingsSchema}
                onSubmit={async (values, helpers) => {
                  helpers.setStatus(undefined);
                  try {
                    await saveMutation.mutateAsync(values);
                  } catch (error) {
                    helpers.setStatus(
                      error instanceof Error
                        ? error.message
                        : "Não foi possível salvar.",
                    );
                  }
                }}
              >
                {({ isSubmitting, status, values }) => (
                  <FormikForm>
                    {status ? (
                      <Alert
                        type="error"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message={status}
                      />
                    ) : null}
                    <p className="mb-4 text-sm leading-normal text-food-muted">
                      Se o cliente não responder, na metade desse prazo o bot pergunta
                      “Ainda está aí?”. No tempo total, reinicia o atendimento, descarta
                      o pedido em montagem e avisa no WhatsApp. A conversa continua em
                      Ativas; a próxima mensagem dele inicia o pedido de novo.
                    </p>
                    <div className="mb-2 flex flex-wrap items-end gap-x-5 gap-y-3">
                      <FormControl name="idleTimeoutMinutes" label="Tempo limite">
                        {({ value, setValue, setTouched }) => (
                          <InputNumber
                            min={1}
                            max={10080}
                            step={5}
                            value={Number(value) || undefined}
                            addonAfter="minutos"
                            style={{ width: "100%", maxWidth: 220 }}
                            onChange={(next) => setValue(next ?? 60)}
                            onBlur={setTouched}
                          />
                        )}
                      </FormControl>
                      <p
                        className="mb-3 text-[22px] font-extrabold leading-tight tracking-tight text-food-accent tabular-nums"
                        aria-live="polite"
                      >
                        {formatIdleLabel(Number(values.idleTimeoutMinutes))}
                      </p>
                    </div>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={isSubmitting || saveMutation.isPending}
                      disabled={!storeQuery.isFetched}
                    >
                      Salvar
                    </Button>
                  </FormikForm>
                )}
              </Formik>
            </Card>
          </>
        ) : null}

        {tab === "pedidos" ? <PrepSettingsCard store={store} /> : null}

        {tab === "impressao" ? (
          <>
            <ReceiptSettingsCard store={store} />
            <PrinterSettingsCard />
          </>
        ) : null}

        {tab === "entrega" ? <NeighborhoodFees store={store} /> : null}

        {tab === "uso" ? (
          <>
            <OpenAiUsageCard />
            <MetaUsageCard />
            <Card
              className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft"
              title="Status da API"
            >
              <div className="flex flex-wrap gap-2">
                <Tag color={health?.ok ? "green" : "red"}>
                  API {health?.ok ? "online" : "offline"}
                </Tag>
                <Tag color={health?.supabase ? "green" : "orange"}>
                  Banco de dados {health?.supabase ? "ok" : "pendente"}
                </Tag>
                <Tag color={health?.whatsapp ? "green" : "orange"}>
                  WhatsApp {health?.whatsapp ? "ok" : "pendente"}
                </Tag>
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </>
  );
}
