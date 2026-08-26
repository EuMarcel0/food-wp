import type { ReactNode } from "react";
import { Card, Typography } from "antd";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <Card className="auth-card" bordered={false}>
        <div className="auth-brand">
          <div className="food-mark">🍽️</div>
          <div>
            <strong>Food WP</strong>
            <span>Retaguarda do bot</span>
          </div>
        </div>
        <Typography.Title level={4} className="auth-title">
          {title}
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="auth-subtitle">
          {subtitle}
        </Typography.Paragraph>
        {children}
      </Card>
    </div>
  );
}
