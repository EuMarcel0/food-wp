import { Formik, Form as FormikForm } from "formik";
import { Alert, Button, Input, Modal, Switch } from "antd";
import { FormControl, FormField } from "../../components/FormField";
import {
  addonSchema,
  maskBRL,
  parseReais,
  type AddonValues,
} from "../../lib/validation";
import type { Addon } from "../../types";

export function AddonForm({
  open,
  addon,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  addon: Addon | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: AddonValues) => Promise<void>;
}) {
  const initialValues: AddonValues = {
    name: addon?.name ?? "",
    price: addon ? maskBRL(String(Math.round(addon.price * 100))) : "",
    sortOrder: addon ? String(addon.sortOrder) : "0",
    active: addon?.active ?? true,
  };

  return (
    <Modal
      title={addon ? "Editar adicional" : "Incluir adicional"}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validationSchema={addonSchema}
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
        {({ isSubmitting, status }) => (
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
              <Input placeholder="Ex.: Bacon, Cheddar…" />
            </FormField>
            <FormControl name="price" label="Valor">
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
            <FormField name="sortOrder" label="Ordem">
              <Input inputMode="numeric" placeholder="0" />
            </FormField>
            <FormControl name="active" label="Ativo no WhatsApp">
              {({ value, setValue }) => (
                <Switch
                  checked={Boolean(value)}
                  onChange={(checked) => setValue(checked)}
                />
              )}
            </FormControl>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button onClick={onCancel}>Cancelar</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSubmitting || submitting}
              >
                {addon ? "Salvar" : "Incluir"}
              </Button>
            </div>
          </FormikForm>
        )}
      </Formik>
    </Modal>
  );
}

export function toAddonPayload(values: AddonValues) {
  const price = parseReais(values.price);
  if (price === null) {
    throw new Error("Informe um valor válido.");
  }
  return {
    name: values.name.trim(),
    price,
    sortOrder: Number(values.sortOrder),
    active: values.active,
  };
}
