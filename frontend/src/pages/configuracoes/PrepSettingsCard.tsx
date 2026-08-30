import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, InputNumber, Switch } from "antd";
import { FormControl } from "../../components/FormField";
import { api } from "../../lib/api";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import {
  prepSettingsSchema,
  type PrepSettingsValues,
} from "../../lib/validation";
import { formToggle } from "../../ui";
import { cn } from "../../lib/cn";
import type { Store } from "../../types";

function formatPrepLabel(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 1) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return hours === 1 ? "1 hora" : `${hours} horas`;
  return `${hours} h ${rest} min`;
}

export function PrepSettingsCard({ store }: { store?: Store }) {
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: (values: PrepSettingsValues) =>
      api.updateStore({
        defaultPrepMinutes: Number(values.defaultPrepMinutes),
        autoAcceptOrders: Boolean(values.autoAcceptOrders),
      }),
    onSuccess: async () => {
      toast.success("Tempo de preparo salvo.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-xl"
      title="Tempo de preparo"
    >
      <Formik
        enableReinitialize
        initialValues={{
          defaultPrepMinutes: store?.defaultPrepMinutes ?? 40,
          autoAcceptOrders: store?.autoAcceptOrders ?? false,
        }}
        validationSchema={prepSettingsSchema}
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
                className="mb-3"
                message={status}
              />
            ) : null}

            <p className="mb-4 text-sm leading-normal text-food-muted">
              Tempo estimado padrão usado no WhatsApp. Com o aceite automático,
              todo pedido novo vai direto para preparo com esse prazo — sem
              precisar confirmar no painel.
            </p>

            <div className="mb-2 flex flex-wrap items-end gap-x-5 gap-y-3">
              <FormControl name="defaultPrepMinutes" label="Tempo padrão">
                {({ value, setValue, setTouched }) => (
                  <InputNumber
                    min={1}
                    max={480}
                    step={5}
                    value={Number(value) || undefined}
                    addonAfter="minutos"
                    style={{ width: "100%", maxWidth: 220 }}
                    onChange={(next) => setValue(next ?? 40)}
                    onBlur={setTouched}
                  />
                )}
              </FormControl>
              <p
                className="mb-3 text-[22px] font-extrabold leading-tight tracking-tight text-food-accent tabular-nums"
                aria-live="polite"
              >
                {formatPrepLabel(Number(values.defaultPrepMinutes))}
              </p>
            </div>

            <label className={cn(formToggle, "mb-4")}>
              <div>
                <strong>Aceitar automaticamente</strong>
                <p>
                  Pedidos novos entram em preparo na hora e o cliente recebe o
                  prazo no WhatsApp
                </p>
              </div>
              <FormControl name="autoAcceptOrders" compact>
                {({ value, setValue }) => (
                  <Switch
                    checked={Boolean(value)}
                    onChange={(checked) => setValue(checked)}
                  />
                )}
              </FormControl>
            </label>

            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting || saveMutation.isPending}
              disabled={!store}
            >
              Salvar
            </Button>
          </FormikForm>
        )}
      </Formik>
    </Card>
  );
}
