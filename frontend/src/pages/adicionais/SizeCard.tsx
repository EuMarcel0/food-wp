import { Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import { formatReais } from "../../lib/format";
import { entityPrice } from "../../ui";
import type { Size } from "../../types";

export function SizeCard({
  size,
  onEdit,
  onDelete,
}: {
  size: Size;
  onEdit: (size: Size) => void;
  onDelete: (size: Size) => void;
}) {
  return (
    <EntityCard
      tone="ready"
      kicker={
        size.maxSelect === 1
          ? "Até 1 sabor"
          : `Até ${size.maxSelect} sabores`
      }
      title={size.name}
      extra={
        <RowActions
          items={[
            { key: "edit", label: "Editar", onClick: () => onEdit(size) },
            {
              key: "delete",
              label: "Excluir",
              danger: true,
              onClick: () => onDelete(size),
            },
          ]}
        />
      }
      footer={
        <>
          <Tag color="orange">
            {size.priceMode === "replace"
              ? "Substitui o preço"
              : "Soma no preço"}
          </Tag>
          <strong className={entityPrice}>{formatReais(size.price)}</strong>
        </>
      }
    />
  );
}
