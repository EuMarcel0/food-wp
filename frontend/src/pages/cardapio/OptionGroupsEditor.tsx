import { Button, Input, InputNumber, Select, Switch } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { FormControl, FormField } from "../../components/FormField";
import { maskBRL } from "../../lib/validation";
import type { ProductValues } from "../../lib/validation";
import { cn } from "../../lib/cn";
import { formEmpty, formToggle } from "../../ui";

function newId() {
  return crypto.randomUUID();
}

function emptySizeGroup(
  defaultPrice = "0,00",
): ProductValues["optionGroups"][number] {
  return {
    id: newId(),
    name: "Tamanho",
    required: true,
    minSelect: 1,
    maxSelect: 1,
    priceMode: "replace",
    exclusiveSet: "tamanho",
    price: defaultPrice,
    options: [],
  };
}

function groupMeta(group: ProductValues["optionGroups"][number]) {
  const sizePrice =
    group.price && group.price !== "0,00" ? `R$ ${group.price}` : null;
  const max =
    Number(group.maxSelect) === 1
      ? "Até 1 sabor"
      : `Até ${group.maxSelect} sabores`;
  return [sizePrice, max].filter(Boolean).join(" · ");
}

export function OptionGroupsEditor({
  groups,
  defaultSizePrice = "0,00",
  onChange,
}: {
  groups: ProductValues["optionGroups"];
  defaultSizePrice?: string;
  onChange: (groups: ProductValues["optionGroups"]) => void;
}) {
  function update(
    index: number,
    patch: Partial<ProductValues["optionGroups"][number]>,
  ) {
    onChange(
      groups.map((group, current) =>
        current === index ? { ...group, ...patch } : group,
      ),
    );
  }

  const sizePriceSeed = defaultSizePrice.replace(/\D/g, "")
    ? defaultSizePrice
    : "0,00";

  return (
    <div className="flex min-h-0 flex-1 flex-col max-lg:min-h-auto max-lg:flex-none">
      <div className="mb-3.5 flex shrink-0 flex-wrap gap-2 [&_.ant-btn]:h-8 [&_.ant-btn]:rounded-full [&_.ant-btn]:border-food-border [&_.ant-btn]:bg-food-chip [&_.ant-btn]:px-3 [&_.ant-btn]:text-food-text">
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() =>
            onChange([...groups, emptySizeGroup(sizePriceSeed)])
          }
        >
          Tamanho
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-auto overscroll-contain pr-1 pb-1 max-lg:min-h-auto max-lg:flex-none max-lg:overflow-visible max-lg:pr-0">
        {groups.length === 0 ? (
          <div className={formEmpty}>
            <p>
              Nenhum tamanho ainda. Cadastre P, M, G… Os sabores vêm das outras
              pizzas do cardápio.
            </p>
          </div>
        ) : null}
        {groups.map((group, groupIndex) => (
          <article
            key={group.id}
            className="rounded-[14px] border border-food-border bg-food-chip p-3.5"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-food-accent/16 text-[11px] font-extrabold tracking-wide text-food-accent">
                  {String(groupIndex + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong className="block truncate text-sm font-bold tracking-tight text-food-text">
                    {group.name || `Tamanho ${groupIndex + 1}`}
                  </strong>
                  <div className="text-xs text-food-muted">
                    {groupMeta(group)}
                  </div>
                </div>
              </div>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() =>
                  onChange(groups.filter((_, index) => index !== groupIndex))
                }
              >
                Remover
              </Button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-2 max-sm:grid-cols-1">
              <FormField
                name={`optionGroups.${groupIndex}.name`}
                label="Nome do tamanho"
              >
                <Input placeholder="Pequena, Média, Grande…" />
              </FormField>
              <FormControl
                name={`optionGroups.${groupIndex}.price`}
                label="Preço"
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
            </div>
            <div className="grid grid-cols-2 gap-2 max-lg:grid-cols-1">
              <FormControl
                name={`optionGroups.${groupIndex}.priceMode`}
                label="Como entra no preço"
              >
                {({ value, setValue }) => (
                  <Select
                    style={{ width: "100%" }}
                    value={String(value ?? "replace")}
                    onChange={(next) => setValue(next)}
                    options={[
                      {
                        value: "replace",
                        label: "Substitui o preço do item",
                      },
                      {
                        value: "addon",
                        label: "Soma no preço base",
                      },
                    ]}
                  />
                )}
              </FormControl>
              <FormControl
                name={`optionGroups.${groupIndex}.maxSelect`}
                label="Máximo de sabores"
              >
                {({ value, setValue }) => (
                  <InputNumber
                    min={1}
                    max={10}
                    style={{ width: "100%" }}
                    value={Number(value ?? 1)}
                    onChange={(next) => {
                      const maxSelect = Number(next ?? 1);
                      update(groupIndex, {
                        maxSelect,
                        minSelect: Math.min(
                          Number(group.minSelect ?? 1),
                          maxSelect,
                        ),
                        exclusiveSet: "tamanho",
                      });
                      setValue(maxSelect);
                    }}
                  />
                )}
              </FormControl>
            </div>
            <label className={cn(formToggle, "mb-0")}>
              <div>
                <strong>Obrigatório</strong>
                <p>O cliente precisa escolher este tamanho</p>
              </div>
              <FormControl name={`optionGroups.${groupIndex}.required`} compact>
                {({ value, setValue }) => (
                  <Switch
                    checked={Boolean(value)}
                    onChange={(checked) => {
                      setValue(checked);
                      update(groupIndex, {
                        required: checked,
                        exclusiveSet: "tamanho",
                        minSelect: checked
                          ? Math.max(1, group.minSelect)
                          : 0,
                      });
                    }}
                  />
                )}
              </FormControl>
            </label>
            <p className="mt-3 mb-0 text-xs text-food-muted">
              No WhatsApp, depois do tamanho o cliente escolhe até{" "}
              {Number(group.maxSelect) || 1} sabor
              {Number(group.maxSelect) === 1 ? "" : "es"} entre as pizzas do
              cardápio.
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
