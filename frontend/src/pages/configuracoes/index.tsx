import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, InputNumber, Tag } from "antd";
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

function formatIdleLabel(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 1) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return hours === 1 ? "1 hora" : `${hours} horas`;
  return `${hours} h ${rest} min`;
}

export function SettingsPage() {
  const queryClient = useQueryClient();
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

  if (loading) {
    return <SettingsSkeleton />;
  }

  const store = storeQuery.data;
  const health = healthQuery.data;
  const initialValues: BotSettingsValues = {
    idleTimeoutMinutes: store?.idleTimeoutMinutes ?? 60,
  };

  return (
    <>
      <PageHeader
        kicker="Retaguarda"
        title="Configurações"
        subtitle="Perfil no WhatsApp, horário, preparo, cupom, impressão, tempo sem resposta e taxas de entrega."
      />

      <div className="flex flex-col gap-6">
        <BrandingCard store={store} whatsappReady={health?.whatsapp} />

        <PrepSettingsCard store={store} />

        <ReceiptSettingsCard store={store} />

        <PrinterSettingsCard />

        <Card
          className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-xl"
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
                  Se o cliente não responder nesse prazo, o bot encerra o
                  atendimento, descarta o pedido em montagem e avisa no
                  WhatsApp. A próxima mensagem dele inicia uma conversa nova.
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
                  <p className="mb-3 text-[22px] font-extrabold leading-tight tracking-tight text-food-accent tabular-nums" aria-live="polite">
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

        <NeighborhoodFees store={store} />
      </div>
    </>
  );
}
