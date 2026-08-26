import { Button, Input, InputNumber, Select, Switch } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { FormControl, FormField } from "../../components/FormField";
import { maskBRL } from "../../lib/validation";
import type { ProductValues } from "../../lib/validation";

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
    <div className="product-form-groups">
      <div className="product-form-templates">
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
      <div className="product-form-groups-scroll">
      {groups.length === 0 ? (
        <div className="product-form-empty">
          <p>
            Nenhuma etapa ainda. Comece por um atalho ou crie um grupo livre.
          </p>
        </div>
      ) : null}
      {groups.map((group, groupIndex) => (
        <article key={group.id} className="product-form-group">
          <div className="product-form-group-head">
            <div className="product-form-group-title">
              <span className="product-form-step">
                {String(groupIndex + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>{group.name || `Etapa ${groupIndex + 1}`}</strong>
                <div className="product-form-group-meta">{groupMeta(group)}</div>
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
          <div className="product-form-group-grid">
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
                    { value: "addon", label: "Soma no preço base (sabores não somam entre si)" },
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
          <label className="product-form-toggle" style={{ marginBottom: 12 }}>
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
          <label className="product-form-toggle" style={{ marginBottom: 12 }}>
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
          <div className="product-form-options">
            <div className="product-form-options-head">
              <span>Opção</span>
              <span>Preço</span>
              <span />
            </div>
            {group.options.map((option, optionIndex) => (
              <div key={option.id} className="product-form-option">
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
                  className="product-form-option-remove"
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
              className="product-form-add-option"
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
