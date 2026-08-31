import { Button, Tag } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
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
  addonLabel,
  crustLabel,
  cashChangeLabel,
} from "../../lib/format";
import { entityItems, entityMeta, entityPrice } from "../../ui";
import type { Order, OrderStatus } from "../../types";

export function OrderCard({
  order,
  updating,
  onChangeStatus,
  onPreviewReceipt,
}: {
  order: Order;
  updating: boolean;
  onChangeStatus: (order: Order, status: OrderStatus) => void;
  onPreviewReceipt: (order: Order) => void;
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
        <span className="flex items-center">
          <Button
            type="text"
            aria-label="Ver cupom"
            icon={<FileTextOutlined />}
            onClick={() => onPreviewReceipt(order)}
          />
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
        </span>
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
                {cashChangeLabel(order.changeForCents, order.totalCents)}
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
          ? order.items?.map((item, index) => {
              const crust = crustLabel(item.extras);
              const addons = addonLabel(item.extras);
              return (
              <li key={item.id ?? `${item.name}-${index}`}>
                <span>
                  {item.name}
                  {item.notes ? ` (obs.: ${item.notes})` : ""}
                  {` x ${item.quantity} - ${formatBRL(item.unitPriceCents)}`}
                  {crust ? (
                    <div className="font-normal text-food-muted">{crust}</div>
                  ) : null}
                  {addons ? (
                    <div className="font-normal text-food-muted">{addons}</div>
                  ) : null}
                </span>
              </li>
              );
            })
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
