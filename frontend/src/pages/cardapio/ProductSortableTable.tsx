import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HolderOutlined } from "@ant-design/icons";
import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Key } from "react";
import type { Product } from "../../types";
import { tableClass, tableGridFill } from "../../ui";

const WA_LIST_PAGE = 10;

type ProductSortableTableProps = {
  products: Product[];
  loading: boolean;
  bodyHeight: number | undefined;
  selectedKeys: Key[];
  onSelectedKeysChange: (keys: Key[]) => void;
  columns: ColumnsType<Product>;
  canReorder: boolean;
  reordering: boolean;
  onReorder: (orderedIds: string[]) => void;
};

function SortableRow({
  children,
  ...props
}: {
  "data-row-key": string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const id = String(props["data-row-key"] ?? "");
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging
      ? { position: "relative", zIndex: 2, opacity: 0.92 }
      : null),
  };

  return (
    <tr {...props} ref={setNodeRef} style={style}>
      {Children.map(children, (child, index) => {
        // Com rowSelection, a 1ª célula é o checkbox; a 2ª é o handle de arrastar.
        if (index !== 1 || !isValidElement(child)) return child;
        const cell = child as ReactElement<{ children?: ReactNode }>;
        return cloneElement(cell, {
          children: (
            <button
              type="button"
              ref={setActivatorNodeRef}
              className="inline-flex cursor-grab items-center justify-center rounded-md border-0 bg-transparent p-1 text-food-muted active:cursor-grabbing"
              aria-label="Arrastar para reordenar"
              {...attributes}
              {...listeners}
            >
              <HolderOutlined />
            </button>
          ),
        });
      })}
    </tr>
  );
}

export function ProductSortableTable({
  products,
  loading,
  bodyHeight,
  selectedKeys,
  onSelectedKeysChange,
  columns,
  canReorder,
  reordering,
  onReorder,
}: ProductSortableTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
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

  const tableColumns: ColumnsType<Product> = canReorder
    ? [
        {
          title: "",
          key: "drag",
          width: 44,
          align: "center",
          render: () => null,
        },
        {
          title: "Ordem",
          dataIndex: "sortOrder",
          width: 88,
          render: (_value, _product, index) => (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              {index + 1}
              {index < WA_LIST_PAGE ? (
                <Tag color="green" className="!m-0 !text-[10px]">
                  WA
                </Tag>
              ) : null}
            </span>
          ),
        },
        ...columns,
      ]
    : [
        {
          title: "Ordem",
          dataIndex: "sortOrder",
          width: 80,
          render: (value: number) => (
            <span className="tabular-nums text-food-muted">
              {Number(value ?? 0) + 1}
            </span>
          ),
        },
        ...columns,
      ];

  const table = (
    <Table
      rowKey="id"
      className={`${tableClass} ${tableGridFill}`}
      loading={loading || reordering}
      dataSource={products}
      pagination={false}
      scroll={{ x: 900, y: bodyHeight }}
      rowSelection={{
        selectedRowKeys: selectedKeys,
        onChange: onSelectedKeysChange,
      }}
      columns={tableColumns}
      components={
        canReorder
          ? {
              body: {
                row: SortableRow,
              },
            }
          : undefined
      }
    />
  );

  if (!canReorder) return table;

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
        {table}
      </SortableContext>
    </DndContext>
  );
}
