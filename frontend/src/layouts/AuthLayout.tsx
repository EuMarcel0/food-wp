import type { ReactNode } from "react";
import { Card, Typography } from "antd";
import { foodMark, kicker } from "../ui";

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
    <div className="relative grid h-dvh place-items-center overflow-auto bg-food-bg p-4 max-sm:place-items-start max-sm:justify-center max-sm:p-3">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_10%_-10%,rgba(232,93,4,0.18),transparent_55%)]"
        aria-hidden="true"
      />
      <Card
        className="relative z-10 w-full max-w-[400px] !rounded-[20px] !border !border-food-border shadow-food max-sm:my-auto"
        bordered={false}
        classNames={{
          body: "px-[22px] py-6 pb-5 max-sm:px-4 max-sm:py-[18px] max-sm:pb-4",
        }}
      >
        <div className="mb-4 flex items-center gap-2.5 text-food-text">
          <div className={foodMark} aria-hidden="true">
            🍽️
          </div>
          <div>
            <strong className="block text-[17px] leading-tight tracking-tight">
              Food WP
            </strong>
            <span className="block text-xs text-food-muted">
              Retaguarda do bot
            </span>
          </div>
        </div>
        <p className={kicker}>Acesso</p>
        <Typography.Title level={4} className="!mt-0 !mb-1 tracking-tight">
          {title}
        </Typography.Title>
        <Typography.Paragraph type="secondary" className="!mb-4">
          {subtitle}
        </Typography.Paragraph>
        {children}
      </Card>
    </div>
  );
}
