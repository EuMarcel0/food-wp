import { Button, Tag } from "antd";
import { FileTextOutlined, HistoryOutlined } from "@ant-design/icons";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import {
  nextStatus,
  STATUS_COLOR,
  STATUS_LABEL,
  statusActionLabel,
  formatBRL,
  formatDate,
  addonLabel,
  crustLabel,
} from "../../lib/format";
import { entityItems, entityMeta, entityPrice } from "../../ui";
import type { Order, OrderStatus, StorePaymentMethod } from "../../types";
import { OrderPaymentSelect } from "./OrderPaymentSelect";

export function OrderCard({
  order,
  updating,
  paymentMethods,
  paymentMethodsLoading,
  onChangeStatus,
  onChangePayment,
  onEditItems,
  onOpenLogs,
  onPreviewReceipt,
}: {
  order: Order;
  updating: boolean;
  paymentMethods: StorePaymentMethod[];
  paymentMethodsLoading?: boolean;
  onChangeStatus: (order: Order, status: OrderStatus) => void;
  onChangePayment: (order: Order, method: StorePaymentMethod) => void;
  onEditItems: () => void;
  onOpenLogs: () => void;
  onPreviewReceipt: (order: Order) => void;
}) {
  const next = nextStatus(order.status, order.fulfillment);
  const isClosed =
    order.status === "cancelled" || order.status === "delivered";
  const canCancel = !isClosed;
  const canEditOrder = !isClosed;

  return (
    <EntityCard
      tone={order.status}
      kicker={order.fulfillment === "delivery" ? "Entrega" : "Retirada"}
      title={`#${order.code}`}
      extra={
        <span className="flex items-center">
          <Button
            type="text"
            aria-label="Ver cupom"
            icon={<FileTextOutlined />}
            onClick={() => onPreviewReceipt(order)}
          />
          <Button
            type="text"
            aria-label="Logs"
            icon={<HistoryOutlined />}
            onClick={onOpenLogs}
          />
          <RowActions
            disabled={isClosed}
            items={[
              next
                ? {
                    key: "next",
                    label: statusActionLabel(next),
                    disabled: updating,
                    onClick: () => onChangeStatus(order, next),
                  }
                : null,
              canEditOrder
                ? {
                    key: "edit",
                    label: "Editar",
                    disabled: updating,
                    onClick: onEditItems,
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
            <span>{formatDate(order.createdAt)}</span>
          </div>
          <strong className={entityPrice}>{formatBRL(order.totalCents)}</strong>
        </>
      }
    >
      <div className="mb-2 font-bold text-food-text">
        {order.customerName || order.customerPhone || "Cliente"}
      </div>
      <div className="mb-3">
        <OrderPaymentSelect
          order={order}
          methods={paymentMethods}
          loading={paymentMethodsLoading}
          disabled={updating || isClosed}
          onChange={(method) => onChangePayment(order, method)}
        />
      </div>
      <ul className={entityItems}>
        {(order.items ?? []).length ? (
          order.items?.map((item, index) => {
            const crust = crustLabel(item.extras);
            const addons = addonLabel(item.extras);
            return (
              <li key={item.id ?? `${item.name}-${index}`}>
                <span>
                  {`${item.quantity}x ${item.name}`}
                  {item.notes ? ` (obs.: ${item.notes})` : ""}
                  {` - ${formatBRL(item.unitPriceCents)}`}
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
        ) : (
          <li>Sem itens</li>
        )}
      </ul>
      {order.notes ? (
        <p className="mt-2 mb-0 text-[13px] text-food-muted">
          Pedido: {order.notes}
        </p>
      ) : null}
      {order.status === "cancelled" && order.cancelReason ? (
        <p className="mt-2 mb-0 text-[13px] text-food-muted">
          Motivo: {order.cancelReason}
        </p>
      ) : null}
      {next ? (
        <Button
          className="mt-3 w-full"
          type="primary"
          loading={updating}
          onClick={() => onChangeStatus(order, next)}
        >
          {statusActionLabel(next)}
        </Button>
      ) : null}
    </EntityCard>
  );
}
