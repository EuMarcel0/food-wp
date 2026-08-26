import { Button, Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import {
  nextStatus,
  PAYMENT_COLOR,
  PAYMENT_LABEL,
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
  const next = nextStatus(order.status, order.fulfillment);
  const canCancel =
    order.status !== "cancelled" && order.status !== "delivered";

  return (
    <EntityCard
      tone={order.status}
      kicker={
        [
          order.fulfillment === "delivery" ? "Entrega" : "Retirada",
          order.paymentMethod ? PAYMENT_LABEL[order.paymentMethod] : null,
        ]
          .filter(Boolean)
          .join(" · ")
      }
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
            {order.paymentMethod ? (
              <Tag color={PAYMENT_COLOR[order.paymentMethod]}>
                {PAYMENT_LABEL[order.paymentMethod]}
              </Tag>
            ) : null}
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
                {item.notes ? ` · obs.: ${item.notes}` : ""}
              </li>
            ))
          : <li>Sem itens</li>}
      </ul>
      {order.notes ? (
        <p style={{ margin: "8px 0 0", color: "var(--food-muted)", fontSize: 13 }}>
          Pedido: {order.notes}
        </p>
      ) : null}
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
