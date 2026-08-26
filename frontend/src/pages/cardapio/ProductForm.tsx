import { Formik, Form as FormikForm } from "formik";
import { Alert, Button, Input, Modal, Select, Switch } from "antd";
import { FormControl, FormField } from "../../components/FormField";
import {
  maskBRL,
  parseReais,
  productSchema,
  type ProductValues,
} from "../../lib/validation";
import type { Category, Product } from "../../types";

export function ProductForm({
  open,
  product,
  categories,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  product: Product | null;
  categories: Category[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductValues) => Promise<void>;
}) {
  const initialValues: ProductValues = {
    name: product?.name ?? "",
    categoryId: product?.categoryId ?? "",
    description: product?.description ?? "",
    price: product ? maskBRL(String(Math.round(product.price * 100))) : "",
    active: product?.active ?? true,
  };

  return (
    <Modal
      title={product ? "Editar item" : "Incluir item"}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
    >
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validationSchema={productSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            await onSubmit(values);
            helpers.resetForm();
          } catch (error) {
            helpers.setStatus(
              error instanceof Error
                ? error.message
                : product
                  ? "Não foi possível salvar."
                  : "Não foi possível incluir.",
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
              <Input placeholder="Ex.: X-Burguer" />
            </FormField>
            <FormControl name="categoryId" label="Categoria">
              {({ value, setValue, setTouched }) => (
                <Select
                  style={{ width: "100%" }}
                  placeholder="Escolha a categoria"
                  value={value ? String(value) : undefined}
                  onChange={(next) => setValue(next)}
                  onBlur={setTouched}
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              )}
            </FormControl>
            <FormField name="description" label="Descrição">
              <Input.TextArea rows={3} placeholder="Opcional" />
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
                {product ? "Salvar" : "Incluir"}
              </Button>
            </div>
          </FormikForm>
        )}
      </Formik>
    </Modal>
  );
}

export function toProductPayload(values: ProductValues) {
  const price = parseReais(values.price);
  if (price === null) {
    throw new Error("Informe um preço válido.");
  }
  return {
    name: values.name.trim(),
    categoryId: values.categoryId,
    description: values.description.trim() || null,
    price,
    active: values.active,
  };
}
