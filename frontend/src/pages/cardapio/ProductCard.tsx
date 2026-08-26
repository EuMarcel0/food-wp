import { Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import { catalogPriceLabel } from "../../lib/format";
import type { Product } from "../../types";

export function ProductCard({
  product,
  onEdit,
  onToggle,
}: {
  product: Product;
  onEdit: (product: Product) => void;
  onToggle: (product: Product) => void;
}) {
  return (
    <EntityCard
      tone={product.active ? "ready" : "inactive"}
      kicker={product.categoryName}
      title={product.name}
      extra={
        <RowActions
          items={[
            { key: "edit", label: "Editar", onClick: () => onEdit(product) },
            {
              key: "toggle",
              label: product.active ? "Desativar" : "Ativar",
              onClick: () => onToggle(product),
            },
          ]}
        />
      }
      footer={
        <>
          <Tag color={product.active ? "green" : "default"}>
            {product.active ? "Ativo no WhatsApp" : "Inativo"}
          </Tag>
          {product.customizable ? <Tag color="orange">Montável</Tag> : null}
          <strong className="entity-card-price">{catalogPriceLabel(product)}</strong>
        </>
      }
    >
      {product.description ? (
        <p className="entity-card-desc">{product.description}</p>
      ) : (
        <p className="entity-card-desc">Sem descrição</p>
      )}
    </EntityCard>
  );
}
