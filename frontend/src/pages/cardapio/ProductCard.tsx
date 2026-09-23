import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HolderOutlined } from "@ant-design/icons";
import { Tag } from "antd";
import { RowActions } from "../../components/RowActions";
import { cn } from "../../lib/cn";
import { catalogPriceLabel } from "../../lib/format";
import { entityCard, entityPrice, entityTone } from "../../ui";
import type { Product } from "../../types";

export function ProductCard({
  product,
  orderLabel,
  dragHandle,
  onEdit,
  onToggle,
}: {
  product: Product;
  orderLabel?: number;
  /** Handle de arrastar (mobile/desktop cards). */
  dragHandle?: ReactNode;
  onEdit: (product: Product) => void;
  onToggle: (product: Product) => void;
}) {
  return (
    <article
      className={cn(
        entityCard,
        "!p-2.5",
        product.active ? entityTone.ready : entityTone.inactive,
      )}
    >
      <div className="flex items-center gap-2">
        {dragHandle ? <div className="shrink-0">{dragHandle}</div> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {orderLabel != null ? (
              <span className="text-[11px] font-bold tabular-nums text-food-muted">
                #{orderLabel}
              </span>
            ) : null}
            {!product.active ? (
              <Tag color="default" className="!m-0 !px-1.5 !text-[10px] !leading-4">
                Inativo
              </Tag>
            ) : null}
          </div>
          <h4 className="m-0 truncate text-[15px] font-bold leading-tight tracking-tight text-food-text">
            {product.name}
          </h4>
          <strong className={cn(entityPrice, "!mt-0.5 !text-sm")}>
            {catalogPriceLabel(product)}
          </strong>
        </div>
        <div className="shrink-0">
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
        </div>
      </div>
    </article>
  );
}

export function SortableProductCard({
  product,
  orderLabel,
  onEdit,
  onToggle,
}: {
  product: Product;
  orderLabel: number;
  onEdit: (product: Product) => void;
  onToggle: (product: Product) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 2, opacity: 0.92 } : null),
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ProductCard
        product={product}
        orderLabel={orderLabel}
        onEdit={onEdit}
        onToggle={onToggle}
        dragHandle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="inline-flex size-9 touch-none items-center justify-center rounded-lg border border-food-border bg-food-chip text-food-muted active:cursor-grabbing"
            aria-label="Arrastar para reordenar"
            {...attributes}
            {...listeners}
          >
            <HolderOutlined className="text-base" />
          </button>
        }
      />
    </div>
  );
}
