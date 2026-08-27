import { Formik, Form as FormikForm } from "formik";
import { Alert, Button, Checkbox, Input, Modal } from "antd";
import { FormControl, FormField } from "../../components/FormField";
import {
  crustSchema,
  maskBRL,
  parseReais,
  type CrustValues,
} from "../../lib/validation";
import type { Crust } from "../../types";

export function CrustForm({
  open,
  crust,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  crust: Crust | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CrustValues) => Promise<void>;
}) {
  const initialValues: CrustValues = {
    name: crust?.name ?? "",
    addsPrice: crust?.addsPrice ?? false,
    price: crust?.addsPrice
      ? maskBRL(String(Math.round(crust.price * 100)))
      : "",
  };

  return (
    <Modal
      title={crust ? "Editar borda" : "Incluir borda"}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validationSchema={crustSchema}
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
            <FormField name="name" label="Nome">
              <Input placeholder="Ex.: Sem Borda, Borda de cheddar…" />
            </FormField>
            <FormControl name="addsPrice">
              {({ value, setValue }) => (
                <div className="mb-3">
                  <Checkbox
                    checked={Boolean(value)}
                    onChange={(event) => setValue(event.target.checked)}
                  >
                    Soma no valor da pizza
                  </Checkbox>
                </div>
              )}
            </FormControl>
            {values.addsPrice ? (
              <FormControl name="price" label="Preço">
                {({ value, setValue, setTouched }) => (
                  <Input
                    prefix="R$"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={String(value ?? "")}
                    onChange={(event) => setValue(maskBRL(event.target.value))}
                    onBlur={setTouched}
                  />
                )}
              </FormControl>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button onClick={onCancel}>Cancelar</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSubmitting || submitting}
              >
                {crust ? "Salvar" : "Incluir"}
              </Button>
            </div>
          </FormikForm>
        )}
      </Formik>
    </Modal>
  );
}

export function toCrustPayload(values: CrustValues) {
  const price = values.addsPrice ? parseReais(values.price) : 0;
  if (values.addsPrice && price === null) {
    throw new Error("Informe um valor válido.");
  }
  return {
    name: values.name.trim(),
    addsPrice: Boolean(values.addsPrice),
    price: price ?? 0,
  };
}
