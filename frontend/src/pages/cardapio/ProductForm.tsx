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
import { OptionGroupsEditor } from "./OptionGroupsEditor";

function groupsFromProduct(product: Product | null): ProductValues["optionGroups"] {
  return (product?.optionGroups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    required: group.required,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    priceMode: group.priceMode,
    options: group.options.map((option) => ({
      id: option.id,
      name: option.name,
      extraPrice: maskBRL(String(Math.round(option.extraPrice * 100))),
      active: option.active,
    })),
  }));
}

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
    customizable: product?.customizable ?? false,
    optionGroups: groupsFromProduct(product),
  };

  return (
    <Modal
      title={product ? "Editar item" : "Incluir item"}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={680}
    >
      <Formik
        enableReinitialize
        initialValues={initialValues}
        validationSchema={productSchema}
        validateOnChange={false}
        validateOnBlur
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
        {({ isSubmitting, status, values, setFieldValue, errors, touched }) => (
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
              <Input placeholder="Ex.: Pizza, X-Burguer" />
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
            <FormControl
              name="price"
              label={
                values.customizable
                  ? "Preço base (se nenhuma opção substituir)"
                  : "Preço"
              }
            >
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
            <FormControl name="customizable" label="Montável">
              {({ value, setValue }) => (
                <Switch
                  checked={Boolean(value)}
                  onChange={(checked) => setValue(checked)}
                />
              )}
            </FormControl>
            {values.customizable ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>
                  Opções de montagem
                </div>
                {typeof errors.optionGroups === "string" && touched.optionGroups ? (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={errors.optionGroups}
                  />
                ) : null}
                <OptionGroupsEditor
                  groups={values.optionGroups ?? []}
                  onChange={(next) => setFieldValue("optionGroups", next)}
                />
              </div>
            ) : null}
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
  const optionGroups = values.customizable
    ? (values.optionGroups ?? []).map((group, index) => ({
        id: group.id,
        name: group.name.trim(),
        required: group.required,
        minSelect: group.required ? Math.max(1, group.minSelect) : 0,
        maxSelect: Math.max(1, group.maxSelect),
        priceMode: group.priceMode,
        sortOrder: index,
        options: group.options.map((option, optionIndex) => ({
          id: option.id,
          name: option.name.trim(),
          extraPrice: parseReais(option.extraPrice) ?? 0,
          sortOrder: optionIndex,
          active: option.active !== false,
        })),
      }))
    : [];
  return {
    name: values.name.trim(),
    categoryId: values.categoryId,
    description: values.description.trim() || null,
    price,
    active: values.active,
    customizable: Boolean(values.customizable),
    optionGroups,
  };
}
