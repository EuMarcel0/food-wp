import { cn } from "../../lib/cn";

/** Escala visual relativa (0–1) a partir do nome / ordem / preço. */
export function pizzaVisualScale(
  size: { name: string; price: number; sortOrder: number },
  catalog: { name: string; price: number; sortOrder: number }[],
) {
  const name = size.name.trim().toLowerCase();
  if (/(^|\b)(pp|pequena|p\b|p\s*-)/i.test(name) || name.startsWith("p ")) {
    return 0.42;
  }
  if (/(^|\b)(média|media|m\b|m\s*-)/i.test(name) || name.startsWith("m ")) {
    return 0.58;
  }
  if (/(^|\b)(grande|g\b|g\s*-)/i.test(name) || name.startsWith("g ")) {
    return 0.74;
  }
  if (/(fam[ií]lia|gigante|family|^f\b|f\s*-)/i.test(name) || name.startsWith("f ")) {
    return 0.92;
  }

  if (catalog.length <= 1) return 0.7;
  const ordered = [...catalog].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.price - right.price,
  );
  const index = Math.max(
    0,
    ordered.findIndex(
      (item) =>
        item.name === size.name &&
        item.sortOrder === size.sortOrder &&
        item.price === size.price,
    ),
  );
  const step = ordered.length <= 1 ? 0 : index / (ordered.length - 1);
  return 0.4 + step * 0.52;
}

export function PizzaSizeIcon({
  scale,
  active = false,
  frame = 96,
  className,
}: {
  scale: number;
  active?: boolean;
  frame?: number;
  className?: string;
}) {
  const diameter = Math.round(frame * (0.38 + scale * 0.52));
  const crust = active ? "#e89a2c" : "#c48a3a";
  const cheese = active ? "#f6d56a" : "#e8c85a";
  const pepperoni = active ? "#d4523c" : "#b84a38";

  return (
    <span
      className={cn(
        "grid place-items-center rounded-2xl bg-food-card/70",
        className,
      )}
      style={{ width: frame, height: frame }}
      aria-hidden
    >
      <svg
        width={diameter}
        height={diameter}
        viewBox="0 0 100 100"
        className="drop-shadow-sm transition-[width,height] duration-200"
      >
        <circle cx="50" cy="50" r="48" fill={crust} />
        <circle cx="50" cy="50" r="40" fill={cheese} />
        <line
          x1="50"
          y1="10"
          x2="50"
          y2="90"
          stroke={crust}
          strokeWidth="2.5"
          opacity="0.45"
        />
        <line
          x1="10"
          y1="50"
          x2="90"
          y2="50"
          stroke={crust}
          strokeWidth="2.5"
          opacity="0.45"
        />
        <line
          x1="22"
          y1="22"
          x2="78"
          y2="78"
          stroke={crust}
          strokeWidth="2"
          opacity="0.35"
        />
        <line
          x1="78"
          y1="22"
          x2="22"
          y2="78"
          stroke={crust}
          strokeWidth="2"
          opacity="0.35"
        />
        <circle cx="34" cy="36" r="5.5" fill={pepperoni} />
        <circle cx="62" cy="32" r="4.5" fill={pepperoni} />
        <circle cx="68" cy="58" r="5" fill={pepperoni} />
        <circle cx="38" cy="64" r="4.8" fill={pepperoni} />
        <circle cx="52" cy="48" r="4.2" fill={pepperoni} />
      </svg>
    </span>
  );
}
