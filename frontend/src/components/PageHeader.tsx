import type { ReactNode } from "react";
import { Typography } from "antd";
import { kicker } from "../ui";

export function PageHeader({
  kicker: kickerLabel,
  title,
  subtitle,
  extra,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 max-sm:flex-col max-sm:items-stretch">
      <div>
        {kickerLabel ? <p className={kicker}>{kickerLabel}</p> : null}
        <Typography.Title
          level={3}
          className="min-h-[1.35em] !mt-0 !mb-1 font-extrabold tracking-tight text-pretty max-sm:!text-2xl"
        >
          {title}
        </Typography.Title>
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
