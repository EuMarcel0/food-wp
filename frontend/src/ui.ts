export const foodMark =
  "grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-linear-to-b from-[#ff7a1a] to-food-accent text-[17px] shadow-[0_6px_16px_rgba(232,93,4,0.28)]";

export const kicker =
  "m-0 mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-food-accent";

export const tableWrap =
  "w-full overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft max-lg:hidden";

export const listCards = "hidden max-lg:block";

export const tableClass =
  "[&_.ant-table]:bg-transparent [&_.ant-table-thead_th]:text-[11px] [&_.ant-table-thead_th]:font-bold [&_.ant-table-thead_th]:uppercase [&_.ant-table-thead_th]:tracking-wider [&_.ant-table-tbody_td]:align-middle [&_.ant-table-tbody_td]:tabular-nums";

export const entityCard =
  "relative overflow-hidden rounded-[18px] border border-food-border bg-food-card p-4 pb-3.5 shadow-food-soft before:absolute before:inset-y-3.5 before:left-0 before:w-[3px] before:rounded-full before:bg-food-accent before:content-['']";

export const entityTone: Record<string, string> = {
  received: "before:bg-food-accent",
  preparing: "before:bg-amber-500",
  ready: "before:bg-green-500",
  out_for_delivery: "before:bg-blue-500",
  delivered: "before:bg-green-600",
  cancelled: "before:bg-red-500",
  inactive: "before:bg-zinc-500",
};

export const entityDesc = "m-0 line-clamp-2";

export const entityItems =
  "m-0 flex list-none flex-wrap gap-1.5 p-0 [&_li]:rounded-full [&_li]:bg-food-chip [&_li]:px-2.5 [&_li]:py-1 [&_li]:text-xs [&_li]:font-semibold [&_li]:text-food-text";

export const entityPrice =
  "text-lg font-extrabold leading-none tracking-tight text-food-accent tabular-nums";

export const entityMeta = "flex flex-wrap items-center gap-2 text-xs text-food-muted";

export const formToggle =
  "flex items-center justify-between gap-4 rounded-xl border border-food-border bg-food-chip px-3.5 py-3 [&_strong]:block [&_strong]:text-[13px] [&_strong]:font-semibold [&_strong]:text-food-text [&_p]:mt-0.5 [&_p]:mb-0 [&_p]:block [&_p]:text-xs [&_p]:leading-snug [&_p]:text-food-muted [&_.ant-form-item]:mb-0 [&_.ant-form-item-control-input]:min-h-0";

export const formKicker =
  "m-0 mb-1 shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-food-accent";

export const formHeading =
  "m-0 mb-1 shrink-0 text-base font-bold tracking-tight text-food-text";

export const formHint =
  "m-0 mb-4 shrink-0 text-[13px] leading-snug text-food-muted";

export const formEmpty =
  "grid min-h-60 place-items-center rounded-2xl border border-dashed border-food-border bg-food-chip p-6 text-center [&_p]:mb-3.5 [&_p]:max-w-[28ch] [&_p]:text-[13px] [&_p]:leading-normal [&_p]:text-food-muted";

export const filterSearch = "w-[280px] max-w-full shrink-0";

export const filterSelect = "w-40 shrink-0";
