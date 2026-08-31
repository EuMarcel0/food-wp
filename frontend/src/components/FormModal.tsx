import type { ReactNode } from "react";
import { Modal } from "antd";
import { cn } from "../lib/cn";

export function FormModal({
  open,
  onCancel,
  kicker,
  title,
  hint,
  icon,
  children,
  footer,
  width = 440,
}: {
  open: boolean;
  onCancel: () => void;
  kicker: string;
  title: string;
  hint?: string;
  icon: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  width?: number;
}) {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      centered
      width={width}
      title={null}
      closable
      styles={{
        content: { padding: 0 },
        header: { display: "none", padding: 0, margin: 0 },
        body: { padding: 0 },
        footer: { display: "none", padding: 0 },
      }}
      classNames={{
        content:
          "!p-0 !px-0 !py-0 overflow-hidden border border-food-border bg-food-surface shadow-food",
        header: "hidden !p-0 !m-0",
        body: "!p-0 !px-0 !py-0",
      }}
      rootClassName="[&_.ant-modal-content]:!p-0 [&_.ant-modal-body]:!p-0 [&_.ant-modal-close]:top-3.5 [&_.ant-modal-close]:right-3.5 [&_.ant-modal-close]:text-food-muted"
    >
      <div className="overflow-hidden">
        <div className="flex gap-3.5 border-b border-food-border px-5 pt-5 pb-4">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-[12px]",
              "bg-linear-to-b from-[#ff7a1a] to-food-accent text-lg text-white",
              "shadow-[0_8px_18px_rgba(232,93,4,0.32)]",
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 pr-8">
            <p className="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-food-accent">
              {kicker}
            </p>
            <h2 className="m-0 text-lg font-bold tracking-tight text-balance text-food-text">
              {title}
            </h2>
            {hint ? (
              <p className="m-0 mt-1 text-[13px] leading-snug text-food-muted">
                {hint}
              </p>
            ) : null}
          </div>
        </div>
        <div className="px-5 pt-4 pb-2">
          <div className="rounded-2xl border border-food-border bg-food-chip/70 p-3.5 [&_.ant-form-item]:mb-3 [&_.ant-form-item:last-child]:mb-0">
            {children}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-food-border bg-food-surface/90 px-5 py-3.5">
          {footer}
        </div>
      </div>
    </Modal>
  );
}
