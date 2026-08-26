import { Formik, Form as FormikForm } from "formik";
import { Alert, Button, Input, Modal, Switch } from "antd";
import { FormControl, FormField } from "../../components/FormField";
import { categorySchema, type CategoryValues } from "../../lib/validation";
import type { Category } from "../../types";

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
    <Modal
      title={category ? "Editar categoria" : "Incluir categoria"}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
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
              <Input placeholder="Ex.: Lanches" />
            </FormField>
            <FormField name="sortOrder" label="Ordem">
              <Input inputMode="numeric" placeholder="0" />
            </FormField>
            <FormControl name="active" label="Ativa no cardápio">
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
                {category ? "Salvar" : "Incluir"}
              </Button>
            </div>
          </FormikForm>
        )}
      </Formik>
    </Modal>
  );
}

export function toCategoryPayload(values: CategoryValues) {
  return {
    name: values.name.trim(),
    sortOrder: Number(values.sortOrder),
    active: values.active,
  };
}
