import type { ReactNode } from "react";
import { Typography } from "antd";

export function PageHeader({
  kicker,
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
    <div className="page-header">
      <div>
        {kicker ? <p className="page-kicker">{kicker}</p> : null}
        <Typography.Title level={3} className="page-title">
          {title}
        </Typography.Title>
        {subtitle ? (
          <Typography.Paragraph type="secondary" className="page-subtitle">
            {subtitle}
          </Typography.Paragraph>
        ) : null}
      </div>
      {extra ? <div className="page-header-extra">{extra}</div> : null}
    </div>
  );
}
