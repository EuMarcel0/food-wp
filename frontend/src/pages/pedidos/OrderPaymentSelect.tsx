import { Select } from "antd";
import { cashChangeLabel, orderPaymentLabel } from "../../lib/format";
import type { Order, StorePaymentMethod } from "../../types";

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function matchPaymentMethod(order: Order, methods: StorePaymentMethod[]) {
  const label = order.paymentMethodLabel?.trim() ?? "";
  if (label) {
    const byLabel = methods.find(
      (method) => normalizeName(method.name) === normalizeName(label),
    );
    if (byLabel) return byLabel;
  }
  if (!order.paymentMethod) return null;
  if (order.paymentMethod === "card") {
    return (
      methods.find((method) => method.kind === "credit" || method.kind === "debit") ??
      null
    );
  }
  return methods.find((method) => method.kind === order.paymentMethod) ?? null;
}

export function OrderPaymentSelect({
  order,
  methods,
  loading,
  disabled,
  onChange,
}: {
  order: Order;
  methods: StorePaymentMethod[];
  loading?: boolean;
  disabled?: boolean;
  onChange: (method: StorePaymentMethod) => void;
}) {
  const matched = matchPaymentMethod(order, methods);
  const currentLabel = orderPaymentLabel(order);
  const keepValue = "__current__";
  const options = [
    ...(!matched && currentLabel
      ? [{ value: keepValue, label: currentLabel }]
      : []),
    ...methods.map((method) => ({
      value: method.id,
      label: method.name,
    })),
  ];

  return (
    <span className="inline-flex w-full min-w-[9.5rem] max-w-[12rem] flex-col items-stretch gap-0.5">
      <Select
        size="small"
        className="w-full"
        placeholder="Pagamento"
        value={matched?.id ?? (currentLabel ? keepValue : undefined)}
        options={options}
        loading={loading}
        disabled={disabled}
        onChange={(value) => {
          if (value === keepValue) return;
          const method = methods.find((item) => item.id === value);
          if (method) onChange(method);
        }}
      />
      {order.paymentMethod === "cash" && order.changeForCents != null ? (
        <span className="whitespace-normal text-center text-[11px] font-medium leading-tight text-food-muted">
          {cashChangeLabel(order.changeForCents, order.totalCents)}
        </span>
      ) : null}
    </span>
  );
}
