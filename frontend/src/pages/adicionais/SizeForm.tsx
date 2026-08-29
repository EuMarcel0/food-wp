import { Formik, Form as FormikForm } from "formik";
import { Alert, Button, Input, InputNumber, Select } from "antd";
import { ExpandOutlined } from "@ant-design/icons";
import { FormControl, FormField } from "../../components/FormField";
import { FormModal } from "../../components/FormModal";
import {
  maskBRL,
  parseReais,
  sizeSchema,
  type SizeValues,
} from "../../lib/validation";
import type { Size } from "../../types";

export function SizeForm({
  open,
  size,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  size: Size | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: SizeValues) => Promise<void>;
}) {
  const initialValues: SizeValues = {
    name: size?.name ?? "",
    price: size
      ? maskBRL(String(Math.round(size.price * 100)))
      : "",
    maxSelect: size?.maxSelect ?? 1,
    priceMode: size?.priceMode ?? "replace",
  };

  return (
    <Formik
      enableReinitialize
      initialValues={initialValues}
      validationSchema={sizeSchema}
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
          kicker="Tamanhos"
          title={size ? "Editar tamanho" : "Incluir tamanho"}
          hint="Cadastre P, M, G… Depois, na pizza, marque quais tamanhos ela oferece."
          icon={<ExpandOutlined />}
          footer={
            <>
              <Button onClick={onCancel}>Cancelar</Button>
              <Button
                type="primary"
                loading={isSubmitting || submitting}
                onClick={() => void submitForm()}
              >
                {size ? "Salvar" : "Incluir"}
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
              <Input placeholder="Ex.: P - Pequena, G - Grande…" />
            </FormField>
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
            <FormControl name="maxSelect" label="Máximo de sabores">
              {({ value, setValue }) => (
                <InputNumber
                  min={1}
                  max={10}
                  style={{ width: "100%" }}
                  value={Number(value ?? 1)}
                  onChange={(next) => setValue(Number(next ?? 1))}
                />
              )}
            </FormControl>
            <FormControl name="priceMode" label="Como entra no preço">
              {({ value, setValue }) => (
                <Select
                  style={{ width: "100%" }}
                  value={String(value ?? "replace")}
                  onChange={(next) => setValue(next)}
                  options={[
                    { value: "replace", label: "Substitui o preço do item" },
                    { value: "addon", label: "Soma no preço base" },
                  ]}
                />
              )}
            </FormControl>
          </FormikForm>
        </FormModal>
      )}
    </Formik>
  );
}

export function toSizePayload(values: SizeValues) {
  const price = parseReais(values.price);
  if (price === null || price <= 0) {
    throw new Error("Informe um preço válido.");
  }
  return {
    name: values.name.trim(),
    price,
    maxSelect: Math.max(1, Math.min(10, Number(values.maxSelect ?? 1))),
    priceMode: (values.priceMode === "addon" ? "addon" : "replace") as
      | "addon"
      | "replace",
  };
}
