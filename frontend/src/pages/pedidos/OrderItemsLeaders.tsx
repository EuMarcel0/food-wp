import { addonLabel, crustLabel } from "../../lib/format";
import type { OrderItem } from "../../types";

export function OrderItemsLeaders({ items }: { items: OrderItem[] }) {
  if (!items.length) return "—";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 leading-snug">
      {items.map((item, index) => {
        const crust = crustLabel(item.extras);
        const addons = addonLabel(item.extras);
        return (
          <div key={item.id ?? `${item.name}-${index}`} className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 break-words">
                {item.name}
                {item.notes ? ` (obs.: ${item.notes})` : ""}
              </span>
              <span
                aria-hidden
                className="mb-[0.32em] min-w-4 flex-1 border-b border-food-muted/20"
              />
              <span className="w-6 shrink-0 text-right tabular-nums font-semibold">
                {item.quantity}
              </span>
            </div>
            {crust ? (
              <div className="pr-8 text-[12px] text-food-muted">{crust}</div>
            ) : null}
            {addons ? (
              <div className="pr-8 text-[12px] text-food-muted">{addons}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
