import { Formik, Form as FormikForm } from "formik";
import { Alert, Button, Input, Switch } from "antd";
import { PlusCircleOutlined } from "@ant-design/icons";
import { FormControl, FormField } from "../../components/FormField";
import { FormModal } from "../../components/FormModal";
import {
  addonSchema,
  maskBRL,
  parseReais,
  type AddonValues,
} from "../../lib/validation";
import type { Addon } from "../../types";
import { formToggle } from "../../ui";
import { cn } from "../../lib/cn";

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
      {({ isSubmitting, status, submitForm }) => (
        <FormModal
          open={open}
          onCancel={onCancel}
          kicker="Extras"
          title={addon ? "Editar adicional" : "Incluir adicional"}
          hint="Aparece no WhatsApp depois da montagem do item, se o produto tiver adicionais ligados."
          icon={<PlusCircleOutlined />}
          footer={
            <>
              <Button onClick={onCancel}>Cancelar</Button>
              <Button
                type="primary"
                loading={isSubmitting || submitting}
                onClick={() => void submitForm()}
              >
                {addon ? "Salvar" : "Incluir"}
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
            <label className={cn(formToggle, "mb-0")}>
              <div>
                <strong>Ativo no WhatsApp</strong>
                <p>Entra na lista de adicionais do cliente</p>
              </div>
              <FormControl name="active" compact>
                {({ value, setValue }) => (
                  <Switch
                    checked={Boolean(value)}
                    onChange={(checked) => setValue(checked)}
                  />
                )}
              </FormControl>
            </label>
          </FormikForm>
        </FormModal>
      )}
    </Formik>
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
