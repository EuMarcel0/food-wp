import { Formik, Form as FormikForm } from "formik";
import { Alert, Button, Input, Radio, Switch } from "antd";
import { WalletOutlined } from "@ant-design/icons";
import { FormControl, FormField } from "../../components/FormField";
import { FormModal } from "../../components/FormModal";
import {
  paymentMethodSchema,
  type PaymentMethodValues,
} from "../../lib/validation";
import type { StorePaymentMethod } from "../../types";
import { formToggle } from "../../ui";
import { cn } from "../../lib/cn";
import { PAYMENT_KIND_LABEL } from "../../lib/format";

export function PaymentMethodForm({
  open,
  method,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  method: StorePaymentMethod | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: PaymentMethodValues) => Promise<void>;
}) {
  const initialValues: PaymentMethodValues = {
    name: method?.name ?? "",
    kind: method?.kind ?? "pix",
    active: method?.active ?? true,
  };

  return (
    <Formik
      enableReinitialize
      initialValues={initialValues}
      validationSchema={paymentMethodSchema}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          await onSubmit(values);
          helpers.resetForm();
        } catch (error) {
          helpers.setStatus(
            error instanceof Error ? error.message : "Não foi possível salvar.",
          );
        }
      }}
    >
      {({ isSubmitting, status, submitForm }) => (
        <FormModal
          open={open}
          onCancel={onCancel}
          kicker="Pagamentos"
          title={method ? "Editar forma de pagamento" : "Incluir forma de pagamento"}
          hint="O bot lista só as formas ativas. Tipo “Dinheiro” pede troco no WhatsApp."
          icon={<WalletOutlined />}
          footer={
            <>
              <Button onClick={onCancel}>Cancelar</Button>
              <Button
                type="primary"
                loading={isSubmitting || submitting}
                onClick={() => void submitForm()}
              >
                {method ? "Salvar" : "Incluir"}
              </Button>
            </>
          }
        >
          <FormikForm>
            {status ? (
              <Alert
                type="error"
                showIcon
                className="mb-3"
                message={status}
              />
            ) : null}
            <FormField name="name" label="Nome">
              <Input placeholder="Ex.: Pix na entrega" maxLength={40} />
            </FormField>
            <FormControl name="kind" label="Tipo (comportamento no bot)">
              {({ value, setValue, setTouched, invalid }) => (
                <Radio.Group
                  className={cn(
                    "flex flex-col gap-2",
                    invalid ? "ring-2 ring-red-400 rounded-md" : undefined,
                  )}
                  value={(value as string) ?? undefined}
                  onChange={(event) => setValue(event.target.value)}
                  onBlur={setTouched}
                  options={(
                    Object.keys(PAYMENT_KIND_LABEL) as StorePaymentMethod["kind"][]
                  ).map((kind) => ({
                    value: kind,
                    label: PAYMENT_KIND_LABEL[kind],
                  }))}
                />
              )}
            </FormControl>
            <FormControl name="active" label="Ativo no WhatsApp">
              {({ value, setValue }) => (
                <div className={cn(formToggle, "mt-1")}>
                  <Switch
                    checked={Boolean(value)}
                    onChange={(checked) => setValue(checked)}
                  />
                  <span>
                    {value ? "Visível para o cliente" : "Oculto"}
                  </span>
                </div>
              )}
            </FormControl>
          </FormikForm>
        </FormModal>
      )}
    </Formik>
  );
}

export function toPaymentMethodPayload(values: PaymentMethodValues) {
  return {
    name: values.name.trim(),
    kind: values.kind,
    active: values.active,
  };
}
