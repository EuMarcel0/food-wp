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
import "./product-form.css";

function groupsFromProduct(product: Product | null): ProductValues["optionGroups"] {
  return (product?.optionGroups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    required: group.required,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    priceMode: group.priceMode,
    exclusiveSet: group.exclusiveSet ?? null,
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
      centered
      width="80vw"
      rootClassName="product-form-modal"
      styles={{
        content: {
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
        },
        header: {
          margin: 0,
          padding: "16px 24px",
          borderBottom: "1px solid var(--food-card-border)",
        },
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          overflow: "hidden",
        },
      }}
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
          <FormikForm className="product-form">
            {status ? (
              <Alert
                className="product-form-alert"
                type="error"
                showIcon
                message={status}
              />
            ) : null}
            <div className="product-form-body">
              <section className="product-form-pane product-form-pane--identity">
                <p className="product-form-kicker">Ficha</p>
                <h3 className="product-form-heading">O que aparece no cardápio</h3>
                <p className="product-form-hint">
                  Nome, categoria e preço base. O cliente vê isso antes de montar o pedido.
                </p>
                <FormField name="name" label="Nome">
                  <Input placeholder="Ex.: Pizza, X-Burguer…" />
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
                  <Input.TextArea rows={4} placeholder="Ingredientes, observação…" />
                </FormField>
                <FormControl
                  name="price"
                  label={
                    values.customizable
                      ? "Preço base (opcional)"
                      : "Preço"
                  }
                >
                  {({ value, setValue, setTouched }) => (
                    <Input
                      prefix="R$"
                      inputMode="numeric"
                      placeholder={values.customizable ? "0,00" : "0,00"}
                      value={String(value ?? "")}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "");
                        if (values.customizable && !digits) {
                          setValue("");
                          return;
                        }
                        setValue(maskBRL(event.target.value));
                      }}
                      onBlur={setTouched}
                    />
                  )}
                </FormControl>
                {values.customizable ? (
                  <p className="product-form-hint product-form-hint--tight">
                    Pode deixar vazio. O bot usa o preço do tamanho; sabores do mesmo grupo não somam entre si.
                  </p>
                ) : null}
                <div className="product-form-toggles">
                  <label className="product-form-toggle">
                    <div>
                      <strong>Ativo no WhatsApp</strong>
                      <p>Entra no cardápio do cliente</p>
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
                  <label className="product-form-toggle">
                    <div>
                      <strong>Montável</strong>
                      <p>Tamanho, sabores, extras e outros grupos</p>
                    </div>
                    <FormControl name="customizable" compact>
                      {({ value, setValue }) => (
                        <Switch
                          checked={Boolean(value)}
                          onChange={(checked) => setValue(checked)}
                        />
                      )}
                    </FormControl>
                  </label>
                </div>
              </section>
              <section
                className={`product-form-pane product-form-pane--assembly${values.customizable ? " is-live" : ""}`}
              >
                <p className="product-form-kicker">Montagem</p>
                <h3 className="product-form-heading">O cliente escolhe nesta ordem</h3>
                {values.customizable ? (
                  <>
                    <p className="product-form-hint">
                      Use + Tamanho uma vez por tamanho se cada um tiver os próprios sabores. O cliente escolhe o tamanho e, na sequência, marca os sabores de uma vez.
                    </p>
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
                  </>
                ) : (
                  <div className="product-form-empty">
                    <p>
                      Ligue Montável para o cliente escolher tamanho, sabores ou extras no WhatsApp.
                    </p>
                    <Button
                      type="primary"
                      onClick={() => setFieldValue("customizable", true)}
                    >
                      Ativar montagem
                    </Button>
                  </div>
                )}
              </section>
            </div>
            <div className="product-form-footer">
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
  const parsed = parseReais(values.price);
  const price = parsed === null && values.customizable ? 0 : parsed;
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
        exclusiveSet: group.exclusiveSet || null,
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
