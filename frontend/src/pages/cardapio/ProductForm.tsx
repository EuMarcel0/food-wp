import { Formik, Form as FormikForm } from "formik";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Checkbox, Input, Modal, Radio, Select, Switch } from "antd";
import { FormControl, FormField } from "../../components/FormField";
import {
  maskBRL,
  parseReais,
  productSchema,
  type ProductValues,
} from "../../lib/validation";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import type { Addon, Category, PizzaKind, Product } from "../../types";
import { OptionGroupsEditor } from "./OptionGroupsEditor";
import { cn } from "../../lib/cn";
import {
  formEmpty,
  formHeading,
  formHint,
  formKicker,
  formToggle,
} from "../../ui";

function groupsFromProduct(
  product: Product | null,
  sizes: { id: string; name: string; price: number; maxSelect: number; priceMode: "addon" | "replace"; sortOrder: number }[],
): ProductValues["optionGroups"] {
  const existing = product?.optionGroups ?? [];
  if (!existing.length) return [];
  if (!sizes.length) {
    return existing.map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      priceMode: group.priceMode,
      exclusiveSet: "tamanho" as const,
      price: maskBRL(
        String(
          Math.round(
            (!(group.price > 0) ? product?.price ?? 0 : group.price ?? 0) * 100,
          ),
        ),
      ),
      options: [],
    }));
  }

  const byId = new Map(sizes.map((size) => [size.id, size]));
  const byName = new Map(
    sizes.map((size) => [size.name.trim().toLowerCase(), size]),
  );
  const picked = new Map<string, (typeof sizes)[number]>();
  for (const group of existing) {
    const match =
      byId.get(group.id) ?? byName.get(group.name.trim().toLowerCase());
    if (match) picked.set(match.id, match);
  }
  return [...picked.values()]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((size) => ({
      id: size.id,
      name: size.name,
      required: true,
      minSelect: 1,
      maxSelect: Math.max(1, size.maxSelect),
      priceMode: size.priceMode,
      exclusiveSet: "tamanho" as const,
      price: maskBRL(String(Math.round(size.price * 100))),
      options: [],
    }));
}

function addonChoices(addons: Addon[], product: Product | null) {
  const map = new Map<string, Addon>();
  for (const item of addons) map.set(item.id, item);
  for (const item of product?.addons ?? []) map.set(item.id, item);
  return [...map.values()].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name, "pt-BR"),
  );
}

export function ProductForm({
  open,
  product,
  categories,
  addons,
  submitting,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  product: Product | null;
  categories: Category[];
  addons: Addon[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductValues) => Promise<void>;
}) {
  const sizesQuery = useQuery({
    queryKey: queryKeys.sizes.options,
    queryFn: () => api.sizes(true),
    enabled: open,
  });
  const sizes = sizesQuery.data ?? [];

  const initialValues: ProductValues = {
    name: product?.name ?? "",
    categoryId: product?.categoryId ?? "",
    description: product?.description ?? "",
    price: product ? maskBRL(String(Math.round(product.price * 100))) : "",
    active: product?.active ?? true,
    customizable: product?.customizable ?? false,
    pizzaKind: product?.customizable ? (product.pizzaKind ?? null) : null,
    notesEnabled: product?.notesEnabled ?? false,
    addonsEnabled: product?.addonsEnabled ?? false,
    crustsEnabled: product?.crustsEnabled ?? false,
    addonIds: (product?.addons ?? []).map((addon) => addon.id),
    optionGroups: groupsFromProduct(product, sizes),
  };

  return (
    <Modal
      title={product ? "Editar item" : "Incluir item"}
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnHidden
      centered
      width="80vw"
      styles={{
        content: { padding: 0 },
        body: { padding: 0 },
      }}
      classNames={{
        content:
          "flex h-[75vh] flex-col overflow-hidden border border-food-border bg-food-surface !p-0 shadow-food max-[1366px]:h-[99vh] max-[1366px]:max-h-[99vh] max-lg:h-[99dvh] max-lg:max-h-[99dvh] [@media(max-height:768px)]:h-[99vh]",
        header:
          "m-0 border-b border-food-border bg-transparent px-6 py-4",
        body: "flex min-h-0 flex-1 flex-col overflow-hidden !p-0",
      }}
      rootClassName="[&_.ant-modal-content]:!p-0 [&_.ant-modal-body]:!p-0 [&_.ant-modal]:max-w-none [&_.ant-modal]:pb-0 max-[1366px]:[&_.ant-modal]:!w-[99vw] max-[1366px]:[&_.ant-modal]:top-[0.5vh] max-lg:[&_.ant-modal]:!w-[99vw] [&_.ant-modal-title]:text-lg [&_.ant-modal-title]:font-bold [&_.ant-modal-title]:tracking-tight [&_.ant-modal-close]:top-3.5"
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
          <FormikForm className="flex h-full min-h-0 flex-1 flex-col">
            {status ? (
              <Alert
                className="mx-6 mt-4"
                type="error"
                showIcon
                message={status}
              />
            ) : null}
            <div className="grid min-h-0 flex-1 overflow-hidden max-lg:grid-cols-1 max-lg:overflow-auto min-[992px]:grid-cols-[minmax(280px,0.4fr)_minmax(0,1fr)]">
              <section className="min-h-0 overflow-auto overscroll-contain border-food-border bg-food-chip/55 px-6 pt-5 pb-6 max-lg:min-h-auto max-lg:overflow-visible max-lg:border-r-0 max-lg:border-b max-lg:px-4 min-[992px]:border-r">
                <p className={formKicker}>Ficha</p>
                <h3 className={formHeading}>O que aparece no cardápio</h3>
                <p className={formHint}>
                  Nome, categoria e preço base. O cliente vê isso antes de montar o pedido.
                </p>
                <FormField name="name" label="Nome">
                  <Input placeholder="Ex.: Pizza, X-Burguer…" />
                </FormField>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1">
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
                  </div>
                  <FormControl name="crustsEnabled" compact>
                    {({ value, setValue }) => (
                      <div className="mb-3 flex h-8 items-center whitespace-nowrap">
                        <Checkbox
                          checked={Boolean(value)}
                          onChange={(event) => setValue(event.target.checked)}
                        >
                          Perguntar borda
                        </Checkbox>
                      </div>
                    )}
                  </FormControl>
                </div>
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
                  <p className={cn(formHint, "-mt-1")}>
                    Cada tamanho tem o próprio preço na montagem. Este valor só entra se o item não tiver tamanhos.
                  </p>
                ) : null}
                <div className="mt-1 grid gap-2">
                  <label className={formToggle}>
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
                  <label className={formToggle}>
                    <div>
                      <strong>É pizza?</strong>
                      <p>Abre a montagem de tamanhos; os sabores vêm das outras pizzas do mesmo tipo</p>
                    </div>
                    <FormControl name="customizable" compact>
                      {({ value, setValue }) => (
                        <Switch
                          checked={Boolean(value)}
                          onChange={(checked) => {
                            setValue(checked);
                            if (!checked) setFieldValue("pizzaKind", null);
                          }}
                        />
                      )}
                    </FormControl>
                  </label>
                  {values.customizable ? (
                    <FormControl name="pizzaKind" label="Tipo da pizza">
                      {({ value, setValue, setTouched, invalid }) => (
                        <Radio.Group
                          value={value ?? undefined}
                          onChange={(event) => setValue(event.target.value)}
                          onBlur={setTouched}
                          optionType="button"
                          buttonStyle="solid"
                          className={invalid ? "ring-2 ring-red-400 rounded-md" : undefined}
                          options={[
                            { label: "Salgada", value: "salgada" },
                            { label: "Doce", value: "doce" },
                          ]}
                        />
                      )}
                    </FormControl>
                  ) : null}
                  <label className={formToggle}>
                    <div>
                      <strong>Habilitar observação</strong>
                      <p>Pergunta no WhatsApp. Deixe desligado em itens padrão, como refrigerante</p>
                    </div>
                    <FormControl name="notesEnabled" compact>
                      {({ value, setValue }) => (
                        <Switch
                          checked={Boolean(value)}
                          onChange={(checked) => setValue(checked)}
                        />
                      )}
                    </FormControl>
                  </label>
                  <label className={formToggle}>
                    <div>
                      <strong>Terá adicional</strong>
                      <p>Depois da montagem, o cliente pode marcar vários extras, um de cada vez, e em seguida a quantidade</p>
                    </div>
                    <FormControl name="addonsEnabled" compact>
                      {({ value, setValue }) => (
                        <Switch
                          checked={Boolean(value)}
                          onChange={(checked) => {
                            setValue(checked);
                            if (!checked) setFieldValue("addonIds", []);
                          }}
                        />
                      )}
                    </FormControl>
                  </label>
                  {values.addonsEnabled ? (
                    <>
                      <FormControl name="addonIds" label="Adicionais deste item (opcional)">
                        {({ value, setValue, setTouched }) => {
                          const selected = new Set(
                            Array.isArray(value) ? value.map(String) : [],
                          );
                          const options = addonChoices(addons, product).filter(
                            (addon) => addon.active || selected.has(addon.id),
                          );
                          return (
                            <Select
                              mode="multiple"
                              allowClear
                              style={{ width: "100%" }}
                              placeholder={
                                options.length
                                  ? "Vazio = todos os adicionais"
                                  : "Cadastre adicionais na tela Adicionais"
                              }
                              value={Array.isArray(value) ? value : []}
                              onChange={setValue}
                              onBlur={setTouched}
                              optionFilterProp="label"
                              showSearch
                              options={options.map((addon) => ({
                                value: addon.id,
                                label: addon.active
                                  ? addon.name
                                  : `${addon.name} (inativo)`,
                              }))}
                            />
                          );
                        }}
                      </FormControl>
                      <p className={cn(formHint, "-mt-1")}>
                        Se não escolher nenhum, o bot oferece todos os adicionais ativos.
                      </p>
                    </>
                  ) : null}
                </div>
              </section>
              <section
                className={cn(
                  "relative flex min-h-0 min-w-0 flex-col overflow-hidden px-6 pt-5 pb-6 max-lg:min-h-[50vh] max-lg:px-4",
                  values.customizable &&
                    "before:absolute before:inset-y-0 before:left-0 before:z-0 before:w-[3px] before:bg-food-accent before:content-['']",
                )}
              >
                <p className={formKicker}>Montagem</p>
                <h3 className={formHeading}>Tamanhos da pizza</h3>
                {values.customizable ? (
                  <>
                    <p className={formHint}>
                      Clique em <strong>+ Tamanho</strong> e marque os tamanhos cadastrados em Adicionais. No WhatsApp, os sabores vêm só das outras pizzas{" "}
                      {values.pizzaKind === "doce"
                        ? "doces"
                        : values.pizzaKind === "salgada"
                          ? "salgadas"
                          : "do mesmo tipo (doce ou salgada)"}
                      .
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
                      sizes={sizes}
                      loading={sizesQuery.isPending || !sizesQuery.data}
                      onChange={(next) => setFieldValue("optionGroups", next)}
                    />
                  </>
                ) : (
                  <div className={formEmpty}>
                    <p>
                      Marque <strong>É pizza?</strong>, informe se é doce ou salgada e escolha os tamanhos. Os sabores no WhatsApp ficam só entre pizzas do mesmo tipo.
                    </p>
                    <Button
                      type="primary"
                      onClick={() => setFieldValue("customizable", true)}
                    >
                      É pizza — montar tamanhos
                    </Button>
                  </div>
                )}
              </section>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-food-border bg-food-surface px-6 py-3">
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
        exclusiveSet: "tamanho",
        price: parseReais(group.price) ?? 0,
        sortOrder: index,
        options: [],
      }))
    : [];
  return {
    name: values.name.trim(),
    categoryId: values.categoryId,
    description: values.description.trim() || null,
    price,
    active: values.active,
    customizable: Boolean(values.customizable),
    pizzaKind: ((): PizzaKind | null => {
      if (!values.customizable) return null;
      return values.pizzaKind === "doce" || values.pizzaKind === "salgada"
        ? values.pizzaKind
        : null;
    })(),
    notesEnabled: Boolean(values.notesEnabled),
    addonsEnabled: Boolean(values.addonsEnabled),
    crustsEnabled: Boolean(values.crustsEnabled),
    addonIds: values.addonsEnabled ? values.addonIds ?? [] : [],
    optionGroups,
  };
}
