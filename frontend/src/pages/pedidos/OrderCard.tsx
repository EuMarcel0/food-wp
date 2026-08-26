import { Button, Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import {
  NEXT_STATUS,
  STATUS_COLOR,
  STATUS_LABEL,
  formatBRL,
  formatDate,
} from "../../lib/format";
import type { Order, OrderStatus } from "../../types";

export function OrderCard({
  order,
  updating,
  onChangeStatus,
}: {
  order: Order;
  updating: boolean;
  onChangeStatus: (order: Order, status: OrderStatus) => void;
}) {
  const next = NEXT_STATUS[order.status];
  const canCancel =
    order.status !== "cancelled" && order.status !== "delivered";

  return (
    <EntityCard
      tone={order.status}
      kicker={order.fulfillment === "delivery" ? "Entrega" : "Retirada"}
      title={`#${order.code}`}
      extra={
        <RowActions
          items={[
            next
              ? {
                  key: "next",
                  label: STATUS_LABEL[next],
                  disabled: updating,
                  onClick: () => onChangeStatus(order, next),
                }
              : null,
            canCancel
              ? {
                  key: "cancel",
                  label: "Cancelar",
                  danger: true,
                  disabled: updating,
                  onClick: () => onChangeStatus(order, "cancelled"),
                }
              : null,
          ]}
        />
      }
      footer={
        <>
          <div className="entity-card-meta">
            <Tag color={STATUS_COLOR[order.status]}>
              {STATUS_LABEL[order.status]}
            </Tag>
            <span>{formatDate(order.createdAt)}</span>
          </div>
          <strong className="entity-card-price">{formatBRL(order.totalCents)}</strong>
        </>
      }
    >
      <div style={{ fontWeight: 700, color: "var(--food-text)", marginBottom: 8 }}>
        {order.customerName || order.customerPhone || "Cliente"}
      </div>
      <ul className="entity-card-items">
        {(order.items ?? []).length
          ? order.items?.map((item, index) => (
              <li key={item.id ?? `${item.name}-${index}`}>
                {item.quantity}x {item.name}
              </li>
            ))
          : <li>Sem itens</li>}
      </ul>
      {next ? (
        <Button
          className="entity-card-action"
          type="primary"
          loading={updating}
          onClick={() => onChangeStatus(order, next)}
          style={{ marginTop: 12 }}
        >
          {STATUS_LABEL[next]}
        </Button>
      ) : null}
    </EntityCard>
  );
}
