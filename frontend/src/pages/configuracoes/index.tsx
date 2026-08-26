import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, InputNumber, Tag } from "antd";
import { FormControl } from "../../components/FormField";
import { PageHeader } from "../../components/PageHeader";
import { api } from "../../lib/api";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import {
  botSettingsSchema,
  type BotSettingsValues,
} from "../../lib/validation";
import "./configuracoes.css";

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
        subtitle="Regras do bot no WhatsApp: quanto tempo esperar o cliente e quando recomeçar o atendimento."
      />

      <Card className="panel-card settings-bot-card" title="Tempo sem resposta">
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
              <p className="settings-bot-copy">
                Se o cliente não responder nesse prazo, a próxima mensagem dele
                vira o começo de uma conversa nova. O pedido em andamento é
                descartado.
              </p>
              <div className="settings-timeout-row">
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
                <p className="settings-timeout-preview" aria-live="polite">
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

      <Card className="panel-card" title="Status da API">
        <div className="settings-health">
          <Tag color={health?.ok ? "green" : "red"}>
            API {health?.ok ? "online" : "offline"}
          </Tag>
          <Tag color={health?.supabase ? "green" : "orange"}>
            Supabase {health?.supabase ? "ok" : "pendente"}
          </Tag>
          <Tag color={health?.whatsapp ? "green" : "orange"}>
            WhatsApp {health?.whatsapp ? "ok" : "pendente"}
          </Tag>
        </div>
      </Card>
    </>
  );
}
