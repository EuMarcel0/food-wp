import { Button, Input, InputNumber, Select, Switch } from "antd";
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
): ProductValues["optionGroups"][number] {
  return {
    id: newId(),
    name,
    required,
    minSelect: required ? 1 : 0,
    maxSelect,
    priceMode,
    options: [emptyOption()],
  };
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
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button
          size="small"
          onClick={() => onChange([...groups, emptyGroup("Tamanho", "replace", 1)])}
        >
          + Tamanho
        </Button>
        <Button
          size="small"
          onClick={() => onChange([...groups, emptyGroup("Sabores", "addon", 2)])}
        >
          + Sabores
        </Button>
        <Button
          size="small"
          onClick={() => onChange([...groups, emptyGroup("Borda", "addon", 1, false)])}
        >
          + Borda
        </Button>
        <Button
          size="small"
          onClick={() => onChange([...groups, emptyGroup("", "addon", 1)])}
        >
          + Grupo livre
        </Button>
      </div>
      {groups.map((group, groupIndex) => (
        <div
          key={group.id}
          style={{
            border: "1px solid var(--food-border, #e5e5e5)",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{group.name || `Grupo ${groupIndex + 1}`}</strong>
            <Button
              type="link"
              danger
              size="small"
              onClick={() => onChange(groups.filter((_, index) => index !== groupIndex))}
            >
              Remover grupo
            </Button>
          </div>
          <FormField name={`optionGroups.${groupIndex}.name`} label="Nome do grupo">
            <Input placeholder="Tamanho, sabores, borda, ponto da carne..." />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <FormControl
              name={`optionGroups.${groupIndex}.priceMode`}
              label="Preço"
            >
              {({ value, setValue }) => (
                <Select
                  style={{ width: "100%" }}
                  value={String(value ?? "addon")}
                  onChange={(next) => setValue(next)}
                  options={[
                    { value: "replace", label: "Substitui o preço do item" },
                    { value: "addon", label: "Soma no preço" },
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
          <FormControl
            name={`optionGroups.${groupIndex}.required`}
            label="Obrigatório"
          >
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
          {group.options.map((option, optionIndex) => (
            <div
              key={option.id}
              style={{ display: "grid", gridTemplateColumns: "1fr 120px 32px", gap: 8 }}
            >
              <FormField
                name={`optionGroups.${groupIndex}.options.${optionIndex}.name`}
                label={optionIndex === 0 ? "Opções" : ""}
              >
                <Input placeholder="Grande, calabresa, catupiry..." />
              </FormField>
              <FormControl
                name={`optionGroups.${groupIndex}.options.${optionIndex}.extraPrice`}
                label={optionIndex === 0 ? "Preço" : ""}
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
                type="text"
                danger
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
            size="small"
            onClick={() =>
              update(groupIndex, { options: [...group.options, emptyOption()] })
            }
          >
            + Opção
          </Button>
        </div>
      ))}
    </div>
  );
}
