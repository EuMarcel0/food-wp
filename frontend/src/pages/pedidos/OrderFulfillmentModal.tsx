import { useEffect, useMemo, useState } from "react";
import { Form, Input, Modal, Radio, Select } from "antd";
import { formatBRL, cashChangeLabel } from "../../lib/format";
import type { DeliveryNeighborhood, Order, Store } from "../../types";

export function OrderFulfillmentModal({
  order,
  store,
  open,
  submitting,
  onCancel,
  onSave,
}: {
  order: Order | null;
  store?: Store | null;
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSave: (input: {
    fulfillment: Order["fulfillment"];
    neighborhoodId?: string | null;
    addressText?: string | null;
  }) => void;
}) {
  const [fulfillment, setFulfillment] = useState<Order["fulfillment"]>("pickup");
  const [neighborhoodId, setNeighborhoodId] = useState<string | undefined>();
  const [addressText, setAddressText] = useState("");

  const neighborhoods = store?.neighborhoods ?? [];

  useEffect(() => {
    if (!open || !order) return;
    setFulfillment(order.fulfillment);
    const matched =
      order.neighborhoodId ||
      neighborhoods.find(
        (zone) =>
          zone.name.trim().toLowerCase() ===
          (order.neighborhoodName ?? "").trim().toLowerCase(),
      )?.id;
    setNeighborhoodId(matched || undefined);
    setAddressText(order.addressText ?? "");
  }, [open, order?.id, neighborhoods]);

  const selectedZone: DeliveryNeighborhood | undefined = useMemo(
    () => neighborhoods.find((zone) => zone.id === neighborhoodId),
    [neighborhoods, neighborhoodId],
  );

  const nextFeeCents = useMemo(() => {
    if (fulfillment === "pickup") return 0;
    if (selectedZone) return Math.max(0, selectedZone.feeCents);
    return Math.max(0, store?.deliveryFeeCents ?? 0);
  }, [fulfillment, selectedZone, store?.deliveryFeeCents]);

  const nextTotalCents = (order?.subtotalCents ?? 0) + nextFeeCents;
  const nextChangeForCents = useMemo(() => {
    if (!order || order.paymentMethod !== "cash") return null;
    if (order.changeForCents == null) return null;
    const prev = Math.max(0, Math.round(order.changeForCents));
    if (prev === 0) return 0;
    if (prev === order.totalCents) return nextTotalCents;
    if (prev < nextTotalCents) return nextTotalCents;
    return prev;
  }, [order, nextTotalCents]);

  const deliveryNeedsNeighborhood =
    fulfillment === "delivery" && neighborhoods.length > 0;
  const canSave =
    Boolean(order) &&
    !submitting &&
    (fulfillment === "pickup" ||
      !deliveryNeedsNeighborhood ||
      Boolean(neighborhoodId));

  return (
    <Modal
      title={order ? `Tipo do pedido #${order.code}` : "Tipo do pedido"}
      open={open}
      onCancel={onCancel}
      onOk={() => {
        if (!canSave || !order) return;
        onSave({
          fulfillment,
          neighborhoodId:
            fulfillment === "delivery" ? neighborhoodId ?? null : null,
          addressText:
            fulfillment === "delivery" ? addressText.trim() || null : null,
        });
      }}
      okText="Salvar"
      cancelText="Cancelar"
      confirmLoading={submitting}
      okButtonProps={{ disabled: !canSave }}
      destroyOnHidden
      centered
    >
      <Form layout="vertical" requiredMark>
        <Form.Item label="Tipo" required>
          <Radio.Group
            value={fulfillment}
            onChange={(event) => {
              const next = event.target.value as Order["fulfillment"];
              setFulfillment(next);
              if (next === "pickup") {
                setNeighborhoodId(undefined);
              }
            }}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: "pickup", label: "Retirada" },
              {
                value: "delivery",
                label: "Entrega",
                disabled: store?.deliveryEnabled === false,
              },
            ]}
          />
        </Form.Item>

        {fulfillment === "delivery" ? (
          <>
            <Form.Item
              label="Bairro"
              required={neighborhoods.length > 0}
              help={
                neighborhoods.length
                  ? undefined
                  : `Taxa padrão da loja: ${formatBRL(store?.deliveryFeeCents ?? 0)}`
              }
            >
              <Select
                showSearch
                allowClear
                placeholder="Selecione o bairro"
                value={neighborhoodId}
                optionFilterProp="label"
                options={neighborhoods.map((zone) => ({
                  value: zone.id,
                  label: `${zone.name} · ${formatBRL(zone.feeCents)}`,
                }))}
                onChange={(value: string | undefined) =>
                  setNeighborhoodId(value)
                }
              />
            </Form.Item>
            <Form.Item label="Endereço (opcional)">
              <Input.TextArea
                rows={2}
                maxLength={280}
                showCount
                placeholder="Rua, número, complemento…"
                value={addressText}
                onChange={(event) => setAddressText(event.target.value)}
              />
            </Form.Item>
          </>
        ) : (
          <p className="mb-4 text-sm text-food-muted">
            Na retirada a taxa de entrega é zerada.
          </p>
        )}
      </Form>

      <div className="rounded-lg border border-food-border bg-food-surface px-3 py-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-food-muted">Subtotal</span>
          <span>{formatBRL(order?.subtotalCents ?? 0)}</span>
        </div>
        <div className="mt-1 flex justify-between gap-3">
          <span className="text-food-muted">Taxa de entrega</span>
          <span>
            {order && nextFeeCents !== order.deliveryFeeCents ? (
              <>
                <span className="mr-2 text-food-muted line-through">
                  {formatBRL(order.deliveryFeeCents)}
                </span>
                {formatBRL(nextFeeCents)}
              </>
            ) : (
              formatBRL(nextFeeCents)
            )}
          </span>
        </div>
        <div className="mt-1 flex justify-between gap-3 font-semibold">
          <span>Total</span>
          <span>{formatBRL(nextTotalCents)}</span>
        </div>
        {order?.paymentMethod === "cash" && nextChangeForCents != null ? (
          <div className="mt-1 flex justify-between gap-3">
            <span className="text-food-muted">Troco</span>
            <span>{cashChangeLabel(nextChangeForCents, nextTotalCents)}</span>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
