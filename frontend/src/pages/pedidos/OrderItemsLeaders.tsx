import { addonLabel, crustLabel, formatBRL } from "../../lib/format";
import type { OrderItem } from "../../types";

function itemLine(item: OrderItem) {
  const notes = item.notes ? ` (obs.: ${item.notes})` : "";
  return `${item.name}${notes} x ${item.quantity} - ${formatBRL(item.unitPriceCents)}`;
}

export function OrderItemsLeaders({ items }: { items: OrderItem[] }) {
  if (!items.length) return "—";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 leading-snug">
      {items.map((item, index) => {
        const crust = crustLabel(item.extras);
        const addons = addonLabel(item.extras);
        return (
          <div key={item.id ?? `${item.name}-${index}`} className="min-w-0">
            <div className="min-w-0 break-words">{itemLine(item)}</div>
            {crust ? (
              <div className="text-[12px] text-food-muted">{crust}</div>
            ) : null}
            {addons ? (
              <div className="text-[12px] text-food-muted">{addons}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
