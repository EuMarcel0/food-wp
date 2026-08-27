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
import { entityItems, entityMeta, entityPrice } from "../../ui";
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
          disabled={order.status === "delivered"}
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
          <div className={entityMeta}>
            <Tag color={STATUS_COLOR[order.status]}>
              {STATUS_LABEL[order.status]}
            </Tag>
            {order.paymentMethod ? (
              <Tag color={PAYMENT_COLOR[order.paymentMethod]}>
                {PAYMENT_LABEL[order.paymentMethod]}
              </Tag>
            ) : null}
            {order.paymentMethod === "cash" && order.changeForCents != null ? (
              <span>
                {order.changeForCents
                  ? `Troco p/ ${formatBRL(order.changeForCents)}`
                  : "Sem troco"}
              </span>
            ) : null}
            <span>{formatDate(order.createdAt)}</span>
          </div>
          <strong className={entityPrice}>{formatBRL(order.totalCents)}</strong>
        </>
      }
    >
      <div className="mb-2 font-bold text-food-text">
        {order.customerName || order.customerPhone || "Cliente"}
      </div>
      <ul className={entityItems}>
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
        <p className="mt-2 mb-0 text-[13px] text-food-muted">
          Pedido: {order.notes}
        </p>
      ) : null}
      {next ? (
        <Button
          className="mt-3 w-full"
          type="primary"
          loading={updating}
          onClick={() => onChangeStatus(order, next)}
        >
          {STATUS_LABEL[next]}
        </Button>
      ) : null}
    </EntityCard>
  );
}
