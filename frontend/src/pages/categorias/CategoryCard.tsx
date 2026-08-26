import { Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import type { Category } from "../../types";

export function CategoryCard({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <EntityCard
      tone={category.active ? "ready" : "inactive"}
      kicker={`Ordem ${category.sortOrder}`}
      title={category.name}
      extra={
        <RowActions
          items={[
            { key: "edit", label: "Editar", onClick: () => onEdit(category) },
            {
              key: "delete",
              label: "Excluir",
              danger: true,
              onClick: () => onDelete(category),
            },
          ]}
        />
      }
      footer={
        <Tag color={category.active ? "green" : "default"}>
          {category.active ? "Ativa no WhatsApp" : "Inativa"}
        </Tag>
      }
    />
  );
}
