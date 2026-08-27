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

function emptyOption() {
  return { id: newId(), name: "", extraPrice: "0,00", active: true };
}

function emptyGroup(
  name: string,
  priceMode: "addon" | "replace",
  maxSelect: number,
  required = true,
  exclusiveSet: string | null = null,
): ProductValues["optionGroups"][number] {
  return {
    id: newId(),
    name,
    required,
    minSelect: required ? 1 : 0,
    maxSelect,
    priceMode,
    exclusiveSet,
    options: [emptyOption()],
  };
}

function groupMeta(group: ProductValues["optionGroups"][number]) {
  const price =
    group.priceMode === "replace" ? "Substitui o preço" : "Soma no preço";
  const required = group.required ? "Obrigatório" : "Opcional";
  const max =
    Number(group.maxSelect) === 1
      ? "1 escolha"
      : `Até ${group.maxSelect} escolhas`;
  return `${required} · ${price} · ${max}`;
}

export function OptionGroupsEditor({
  groups,
  onChange,
}: {
  groups: ProductValues["optionGroups"];
  onChange: (groups: ProductValues["optionGroups"]) => void;
}) {
  function update(
    index: number,
    patch: Partial<ProductValues["optionGroups"][number]>,
  ) {
    onChange(groups.map((group, current) => (current === index ? { ...group, ...patch } : group)));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col max-lg:min-h-auto max-lg:flex-none">
      <div className="mb-3.5 flex shrink-0 flex-wrap gap-2 [&_.ant-btn]:h-8 [&_.ant-btn]:rounded-full [&_.ant-btn]:border-food-border [&_.ant-btn]:bg-food-chip [&_.ant-btn]:px-3 [&_.ant-btn]:text-food-text">
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() =>
            onChange([...groups, emptyGroup("Tamanho", "replace", 1, true, "tamanho")])
          }
        >
          Tamanho
        </Button>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => onChange([...groups, emptyGroup("Sabores", "addon", 2)])}
        >
          Sabores
        </Button>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => onChange([...groups, emptyGroup("Borda", "addon", 1, false)])}
        >
          Borda
        </Button>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => onChange([...groups, emptyGroup("", "addon", 1)])}
        >
          Grupo livre
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 overflow-auto overscroll-contain pr-1 pb-1 max-lg:min-h-auto max-lg:flex-none max-lg:overflow-visible max-lg:pr-0">
      {groups.length === 0 ? (
        <div className={formEmpty}>
          <p>
            Nenhuma etapa ainda. Comece por um atalho ou crie um grupo livre.
          </p>
        </div>
      ) : null}
      {groups.map((group, groupIndex) => (
        <article key={group.id} className="rounded-[14px] border border-food-border bg-food-chip p-3.5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-food-accent/16 text-[11px] font-extrabold tracking-wide text-food-accent">
                {String(groupIndex + 1).padStart(2, "0")}
              </span>
              <div>
                <strong className="block truncate text-sm font-bold tracking-tight text-food-text">
                  {group.name || `Etapa ${groupIndex + 1}`}
                </strong>
                <div className="text-xs text-food-muted">{groupMeta(group)}</div>
              </div>
            </div>
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => onChange(groups.filter((_, index) => index !== groupIndex))}
            >
              Remover
            </Button>
          </div>
          <FormField name={`optionGroups.${groupIndex}.name`} label="Nome do grupo">
            <Input placeholder="Tamanho, sabores, borda, ponto da carne…" />
          </FormField>
          <div className="grid grid-cols-2 gap-2 max-lg:grid-cols-1">
            <FormControl
              name={`optionGroups.${groupIndex}.priceMode`}
              label="Como entra no preço"
            >
              {({ value, setValue }) => (
                <Select
                  style={{ width: "100%" }}
                  value={String(value ?? "addon")}
                  onChange={(next) => setValue(next)}
                  options={[
                    { value: "replace", label: "Substitui o preço do item" },
                    { value: "addon", label: "Soma no preço base (borda e adicionais)" },
                  ]}
                />
              )}
            </FormControl>
            <FormControl
              name={`optionGroups.${groupIndex}.maxSelect`}
              label="Máximo de escolhas"
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
                      minSelect: Math.min(Number(group.minSelect ?? 1), maxSelect),
                    });
                    setValue(maxSelect);
                  }}
                />
              )}
            </FormControl>
          </div>
          <label className={cn(formToggle, "mb-3")}>
            <div>
              <strong>Obrigatório</strong>
              <p>O cliente precisa responder esta etapa</p>
            </div>
            <FormControl name={`optionGroups.${groupIndex}.required`} compact>
              {({ value, setValue }) => (
                <Switch
                  checked={Boolean(value)}
                  onChange={(checked) => {
                    setValue(checked);
                    update(groupIndex, {
                      required: checked,
                      minSelect: checked ? Math.max(1, group.minSelect) : 0,
                    });
                  }}
                />
              )}
            </FormControl>
          </label>
          <label className={cn(formToggle, "mb-3")}>
            <div>
              <strong>É um tamanho</strong>
              <p>O cliente escolhe entre os tamanhos e só vê os sabores desse</p>
            </div>
            <Switch
              checked={Boolean(group.exclusiveSet)}
              onChange={(checked) =>
                update(groupIndex, { exclusiveSet: checked ? "tamanho" : null })
              }
            />
          </label>
          <div className="rounded-xl border border-food-border bg-food-card p-2.5">
            {group.exclusiveSet || Number(group.maxSelect) > 1 ? (
              <p className="mb-2 px-0.5 text-xs text-food-muted">
                Com preço base preenchido, o valor das opções de tamanho e sabor ainda não altera o total.
              </p>
            ) : null}
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_128px_32px] gap-2 px-0.5 text-[11px] font-bold uppercase tracking-wider text-food-muted max-sm:grid-cols-[minmax(0,1fr)_104px_32px]">
              <span>Opção</span>
              <span>Preço</span>
              <span />
            </div>
            {group.options.map((option, optionIndex) => (
              <div key={option.id} className="mb-2 grid grid-cols-[minmax(0,1fr)_128px_32px] items-start gap-2 max-sm:grid-cols-[minmax(0,1fr)_104px_32px]">
                <FormField
                  name={`optionGroups.${groupIndex}.options.${optionIndex}.name`}
                  compact
                >
                  <Input placeholder="Grande, calabresa, catupiry…" />
                </FormField>
                <FormControl
                  name={`optionGroups.${groupIndex}.options.${optionIndex}.extraPrice`}
                  compact
                >
                  {({ value, setValue, setTouched }) => (
                    <Input
                      prefix="R$"
                      inputMode="numeric"
                      value={String(value ?? "")}
                      onChange={(event) => setValue(maskBRL(event.target.value))}
                      onBlur={setTouched}
                    />
                  )}
                </FormControl>
                <Button
                  className="h-10"
                  type="text"
                  danger
                  aria-label="Remover opção"
                  disabled={group.options.length <= 1}
                  onClick={() =>
                    update(groupIndex, {
                      options: group.options.filter((_, index) => index !== optionIndex),
                    })
                  }
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              className="mt-1"
              size="small"
              icon={<PlusOutlined />}
              onClick={() =>
                update(groupIndex, { options: [...group.options, emptyOption()] })
              }
            >
              Adicionar opção
            </Button>
          </div>
        </article>
      ))}
      </div>
    </div>
  );
}
