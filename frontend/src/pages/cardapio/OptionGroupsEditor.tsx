import { useMemo, useState } from "react";
import { Button, Checkbox } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { maskBRL } from "../../lib/validation";
import type { ProductValues } from "../../lib/validation";
import type { Size } from "../../types";
import { cn } from "../../lib/cn";
import { formEmpty } from "../../ui";
import { formatReais } from "../../lib/format";
import { PizzaSizeIcon, pizzaVisualScale } from "./PizzaSizeIcon";

function sizeToGroup(size: Size): ProductValues["optionGroups"][number] {
  return {
    id: size.id,
    name: size.name,
    required: true,
    minSelect: 1,
    maxSelect: Math.max(1, size.maxSelect),
    priceMode: size.priceMode,
    exclusiveSet: "tamanho",
    price: maskBRL(String(Math.round(size.price * 100))),
    options: [],
  };
}

function selectedSizeIds(
  groups: ProductValues["optionGroups"],
  catalog: Size[],
) {
  const byId = new Set(catalog.map((size) => size.id));
  const byName = new Map(
    catalog.map((size) => [size.name.trim().toLowerCase(), size.id]),
  );
  const ids = new Set<string>();
  for (const group of groups) {
    if (byId.has(group.id)) {
      ids.add(group.id);
      continue;
    }
    const matched = byName.get(group.name.trim().toLowerCase());
    if (matched) ids.add(matched);
  }
  return ids;
}

export function OptionGroupsEditor({
  groups,
  sizes,
  onChange,
}: {
  groups: ProductValues["optionGroups"];
  sizes: Size[];
  defaultSizePrice?: string;
  onChange: (groups: ProductValues["optionGroups"]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(groups.length === 0);
  const selected = useMemo(
    () => selectedSizeIds(groups, sizes),
    [groups, sizes],
  );

  function toggleSize(size: Size, checked: boolean) {
    if (checked) {
      if (selected.has(size.id)) return;
      const next = [...groups, sizeToGroup(size)].sort((left, right) => {
        const leftOrder =
          sizes.find((item) => item.id === left.id)?.sortOrder ?? 999;
        const rightOrder =
          sizes.find((item) => item.id === right.id)?.sortOrder ?? 999;
        return leftOrder - rightOrder;
      });
      onChange(next);
      return;
    }
    onChange(
      groups.filter((group) => {
        if (group.id === size.id) return false;
        return group.name.trim().toLowerCase() !== size.name.trim().toLowerCase();
      }),
    );
  }

  const activeSizes = sizes.filter((size) => size.active);

  return (
    <div className="flex min-h-0 flex-1 flex-col max-lg:min-h-auto max-lg:flex-none">
      <div className="mb-3.5 flex shrink-0 flex-wrap gap-2 [&_.ant-btn]:h-8 [&_.ant-btn]:rounded-full [&_.ant-btn]:border-food-border [&_.ant-btn]:bg-food-chip [&_.ant-btn]:px-3 [&_.ant-btn]:text-food-text">
        <Button
          size="small"
          type={pickerOpen ? "primary" : "default"}
          icon={<PlusOutlined />}
          onClick={() => setPickerOpen((open) => !open)}
        >
          Tamanho
        </Button>
        {selected.size > 0 ? (
          <span className="self-center text-xs text-food-muted">
            {selected.size}{" "}
            {selected.size === 1 ? "tamanho selecionado" : "tamanhos selecionados"}
          </span>
        ) : null}
      </div>

      {!activeSizes.length ? (
        <div className={formEmpty}>
          <p>
            Nenhum tamanho cadastrado. Vá em <strong>Adicionais → Tamanhos</strong>{" "}
            e cadastre P, M, G…
          </p>
        </div>
      ) : null}

      {pickerOpen && activeSizes.length ? (
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 items-stretch gap-2.5 overflow-auto overscroll-contain pr-1 pb-1 max-sm:grid-cols-1 max-lg:min-h-auto max-lg:flex-none max-lg:overflow-visible max-lg:pr-0">
          {activeSizes.map((size) => {
            const checked = selected.has(size.id);
            const scale = pizzaVisualScale(size, activeSizes);
            return (
              <label
                key={size.id}
                className={cn(
                  "relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[14px] border px-3.5 py-4 transition-colors",
                  checked
                    ? "border-food-accent bg-food-accent/10"
                    : "border-food-border bg-food-chip hover:border-food-accent/50",
                )}
              >
                <Checkbox
                  checked={checked}
                  onChange={(event) =>
                    toggleSize(size, event.target.checked)
                  }
                  className="absolute top-3 left-3 z-10"
                />
                <PizzaSizeIcon
                  scale={scale}
                  active={checked}
                  className="mx-auto"
                />
                <span className="mt-2 min-w-0 text-center">
                  <strong className="block text-sm font-bold tracking-tight text-food-text">
                    {size.name}
                  </strong>
                  <span className="mt-0.5 block text-xs text-food-muted">
                    {formatReais(size.price)}
                    {" · "}
                    {size.maxSelect === 1
                      ? "até 1 sabor"
                      : `até ${size.maxSelect} sabores`}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-food-muted/90">
                    {size.priceMode === "replace"
                      ? "substitui o preço"
                      : "soma no preço"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {!pickerOpen && selected.size === 0 && activeSizes.length ? (
        <div className={formEmpty}>
          <p>Clique em <strong>+ Tamanho</strong> e marque os tamanhos desta pizza.</p>
        </div>
      ) : null}

      {!pickerOpen && selected.size > 0 ? (
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          {activeSizes
            .filter((size) => selected.has(size.id))
            .map((size) => (
              <article
                key={size.id}
                className="rounded-[14px] border border-food-border bg-food-chip px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <PizzaSizeIcon
                    scale={pizzaVisualScale(size, activeSizes)}
                    active
                    frame={56}
                    className="shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-bold tracking-tight text-food-text">
                      {size.name}
                    </strong>
                    <div className="text-xs text-food-muted">
                      {formatReais(size.price)}
                      {" · "}
                      {size.maxSelect === 1
                        ? "até 1 sabor"
                        : `até ${size.maxSelect} sabores`}
                    </div>
                  </div>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setPickerOpen(true)}
                  >
                    Alterar
                  </Button>
                </div>
              </article>
            ))}
        </div>
      ) : null}
    </div>
  );
}
