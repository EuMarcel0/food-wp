import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { MobileCardList } from "../../components/MobileCardList";
import type { TablePaginationConfig } from "antd";
import type { Product } from "../../types";
import { ProductCard, SortableProductCard } from "./ProductCard";

export function ProductMobileList({
  products,
  loading,
  isEmpty,
  empty,
  pagination,
  canReorder,
  reordering,
  onReorder,
  onEdit,
  onToggle,
}: {
  products: Product[];
  loading: boolean;
  isEmpty: boolean;
  empty?: string;
  pagination?: TablePaginationConfig;
  canReorder: boolean;
  reordering: boolean;
  onReorder: (orderedIds: string[]) => void;
  onEdit: (product: Product) => void;
  onToggle: (product: Product) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 10 },
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = products.findIndex((item) => item.id === active.id);
    const newIndex = products.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(products, oldIndex, newIndex);
    onReorder(next.map((item) => item.id));
  }

  const list = (
    <MobileCardList
      loading={loading || reordering}
      isEmpty={isEmpty}
      empty={empty}
      pagination={pagination}
    >
      {canReorder
        ? products.map((product, index) => (
            <SortableProductCard
              key={product.id}
              product={product}
              orderLabel={index + 1}
              onEdit={onEdit}
              onToggle={onToggle}
            />
          ))
        : products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              orderLabel={product.sortOrder + 1}
              onEdit={onEdit}
              onToggle={onToggle}
            />
          ))}
    </MobileCardList>
  );

  if (!canReorder) return list;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={products.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {list}
      </SortableContext>
    </DndContext>
  );
}
