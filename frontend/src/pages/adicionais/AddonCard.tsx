import { Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import { formatReais } from "../../lib/format";
import { entityPrice } from "../../ui";
import type { Addon } from "../../types";

export function AddonCard({
  addon,
  onEdit,
  onDelete,
}: {
  addon: Addon;
  onEdit: (addon: Addon) => void;
  onDelete: (addon: Addon) => void;
}) {
  return (
    <EntityCard
      tone={addon.active ? "ready" : "inactive"}
      kicker={`Ordem ${addon.sortOrder}`}
      title={addon.name}
      extra={
        <RowActions
          items={[
            { key: "edit", label: "Editar", onClick: () => onEdit(addon) },
            {
              key: "delete",
              label: "Excluir",
              danger: true,
              onClick: () => onDelete(addon),
            },
          ]}
        />
      }
      footer={
        <>
          <Tag color={addon.active ? "green" : "default"}>
            {addon.active ? "Ativo no WhatsApp" : "Inativo"}
          </Tag>
          <strong className={entityPrice}>{formatReais(addon.price)}</strong>
        </>
      }
    />
  );
}
