import { Formik, Form as FormikForm } from "formik";
import { Alert, Button, Input, Switch } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { FormControl, FormField } from "../../components/FormField";
import { FormModal } from "../../components/FormModal";
import { categorySchema, type CategoryValues } from "../../lib/validation";
import type { Category } from "../../types";
import { formToggle } from "../../ui";
import { cn } from "../../lib/cn";

export function CategoryForm({
  open,
  category,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  category: Category | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CategoryValues) => Promise<void>;
}) {
  const initialValues: CategoryValues = {
    name: category?.name ?? "",
    sortOrder: category ? String(category.sortOrder) : "0",
    active: category?.active ?? true,
  };

  return (
    <Formik
      enableReinitialize
      initialValues={initialValues}
      validationSchema={categorySchema}
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
          kicker="Organização"
          title={category ? "Editar categoria" : "Incluir categoria"}
          hint="Organize o cardápio. Só as categorias ativas aparecem no WhatsApp e no cadastro de itens."
          icon={<AppstoreOutlined />}
          footer={
            <>
              <Button onClick={onCancel}>Cancelar</Button>
              <Button
                type="primary"
                loading={isSubmitting || submitting}
                onClick={() => void submitForm()}
              >
                {category ? "Salvar" : "Incluir"}
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
              <Input placeholder="Ex.: Lanches, Pizzas…" />
            </FormField>
            <FormField name="sortOrder" label="Ordem">
              <Input inputMode="numeric" placeholder="0" />
            </FormField>
            <label className={cn(formToggle, "mb-0")}>
              <div>
                <strong>Ativa no cardápio</strong>
                <p>Aparece no WhatsApp e no cadastro de itens</p>
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

export function toCategoryPayload(values: CategoryValues) {
  return {
    name: values.name.trim(),
    sortOrder: Number(values.sortOrder),
    active: values.active,
  };
}
