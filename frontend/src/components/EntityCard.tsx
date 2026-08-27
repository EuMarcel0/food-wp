import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { entityCard, entityTone } from "../ui";

export function EntityCard({
  kicker,
  title,
  extra,
  children,
  footer,
  tone,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  extra?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: string;
}) {
  return (
    <article className={cn(entityCard, tone ? entityTone[tone] : undefined)}>
      <div className="flex items-start justify-between gap-2 pl-2.5">
        <div className="min-w-0">
          {kicker ? (
            <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-wider text-food-muted">
              {kicker}
            </span>
          ) : null}
          <h4 className="m-0 text-lg leading-tight font-extrabold tracking-tight text-food-text">
            {title}
          </h4>
        </div>
        {extra ? <div className="-mt-1 -mr-1.5 shrink-0">{extra}</div> : null}
      </div>
      {children ? (
        <div className="pt-2.5 pl-2.5 text-[13px] leading-snug text-food-muted">
          {children}
        </div>
      ) : null}
      {footer ? (
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-food-border pt-3 pl-2.5">
          {footer}
        </div>
      ) : null}
    </article>
  );
}
