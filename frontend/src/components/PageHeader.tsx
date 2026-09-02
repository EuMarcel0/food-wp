import type { ReactNode } from "react";
import { Typography } from "antd";
import { cn } from "../lib/cn";
import { kicker } from "../ui";

export function PageHeader({
  kicker: kickerLabel,
  title,
  subtitle,
  extra,
  titleExtra,
  className,
  kickerClassName,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  /** Alinhado à direita na mesma linha do título (ex.: datepicker). */
  titleExtra?: ReactNode;
  className?: string;
  kickerClassName?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 max-sm:flex-col max-sm:items-stretch", className ?? "mb-5")}>
      <div className="min-w-0 flex-1">
        {kickerLabel ? (
          <p className={cn(kicker, kickerClassName)}>{kickerLabel}</p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <Typography.Title
            level={3}
            className="min-h-[1.35em] !mt-0 !mb-1 min-w-0 flex-1 font-extrabold tracking-tight text-pretty max-sm:!text-2xl"
          >
            {title}
          </Typography.Title>
          {titleExtra ? (
            <div className="shrink-0 max-sm:self-end">{titleExtra}</div>
          ) : null}
        </div>
        {subtitle ? (
          <Typography.Paragraph
            type="secondary"
            className="min-h-[1.5em] !mb-0 max-w-2xl"
          >
            {subtitle}
          </Typography.Paragraph>
        ) : null}
      </div>
      {extra ? <div className="shrink-0 max-sm:self-end">{extra}</div> : null}
    </div>
  );
}
