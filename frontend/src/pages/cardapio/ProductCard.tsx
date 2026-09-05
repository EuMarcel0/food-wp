import { Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import { catalogPriceLabel } from "../../lib/format";
import { entityDesc, entityPrice } from "../../ui";
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
          {product.customizable ? (
            <Tag color="orange">
              {product.pizzaKind === "doce"
                ? "Pizza doce"
                : product.pizzaKind === "salgada"
                  ? "Pizza salgada"
                  : "Pizza"}
            </Tag>
          ) : null}
          {product.addonsEnabled ? <Tag color="purple">Adicional</Tag> : null}
          {product.crustsEnabled ? <Tag color="gold">Borda</Tag> : null}
          {product.notesEnabled ? <Tag color="blue">Observação</Tag> : null}
          {product.quantityEnabled ? <Tag color="cyan">Qtd.</Tag> : null}
          <strong className={entityPrice}>{catalogPriceLabel(product)}</strong>
        </>
      }
    >
      {product.description ? (
        <p className={entityDesc}>{product.description}</p>
      ) : (
        <p className={entityDesc}>Sem descrição</p>
      )}
    </EntityCard>
  );
}
