import type { ReactNode } from "react";
import { Typography } from "antd";

export function PageHeader({
  title,
  subtitle,
  extra,
}: {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
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
