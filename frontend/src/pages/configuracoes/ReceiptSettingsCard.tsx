import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Input } from "antd";
import { FormControl, FormField } from "../../components/FormField";
import { api } from "../../lib/api";
import { cnpjDigits, formatCnpj } from "../../lib/format";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import {
  storeReceiptSchema,
  type StoreReceiptValues,
} from "../../lib/validation";
import type { Store } from "../../types";

export function ReceiptSettingsCard({ store }: { store?: Store }) {
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: (values: StoreReceiptValues) =>
      api.updateStore({
        legalName: (values.legalName ?? "").trim() || null,
        cnpj: cnpjDigits(values.cnpj ?? "") || null,
        receiptFooter: (values.receiptFooter ?? "").trim() || null,
      }),
    onSuccess: async () => {
      toast.success("Dados do cupom salvos.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-xl"
      title="Cupom de impressão"
    >
      <p className="mb-4 text-sm leading-normal text-food-muted">
        Cabeçalho e rodapé que saem no cupom de 80 mm. O nome fantasia vem do
        perfil acima. O corpo do cupom é o pedido: cliente, itens, quantidade,
        valores e observações.
      </p>

      <Formik
        enableReinitialize
        initialValues={{
          legalName: store?.legalName ?? "",
          cnpj: store?.cnpj ? formatCnpj(store.cnpj) : "",
          receiptFooter: store?.receiptFooter ?? "",
        }}
        validationSchema={storeReceiptSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            await saveMutation.mutateAsync(values);
          } catch (error) {
            helpers.setStatus(
              error instanceof Error
                ? error.message
                : "Não foi possível salvar o cupom.",
            );
          }
        }}
      >
        {({ isSubmitting, status }) => (
          <FormikForm>
            {status ? (
              <Alert
                type="error"
                showIcon
                className="mb-3"
                message={status}
              />
            ) : null}
            <p className="mb-3 text-sm text-food-text">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-food-muted">
                Nome (cabeçalho)
              </span>
              {store?.name || "Defina o nome no perfil do estabelecimento."}
            </p>
            <FormField name="legalName" label="Razão social">
              <Input placeholder="Razão social da empresa" maxLength={120} />
            </FormField>
            <FormControl name="cnpj" label="CNPJ">
              {({ value, setValue, setTouched }) => (
                <Input
                  placeholder="00.000.000/0000-00"
                  inputMode="numeric"
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => setValue(formatCnpj(event.target.value))}
                  onBlur={setTouched}
                />
              )}
            </FormControl>
            <FormField name="receiptFooter" label="Rodapé">
              <Input.TextArea
                rows={3}
                maxLength={240}
                placeholder="Ex.: Obrigado pela preferência. Instagram @sua_loja"
              />
            </FormField>
            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting || saveMutation.isPending}
              disabled={!store}
            >
              Salvar cupom
            </Button>
          </FormikForm>
        )}
      </Formik>
    </Card>
  );
}
