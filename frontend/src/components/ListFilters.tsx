import { type ReactNode, useState } from "react";
import { FilterOutlined } from "@ant-design/icons";
import { Badge, Button, Modal } from "antd";
import { cn } from "../lib/cn";
import { useMediaQuery } from "../lib/hooks";

export function ListFilters({
  activeCount,
  onClear,
  children,
  className,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  className?: string;
}) {
  const isMobile = useMediaQuery("(max-width: 991px)");
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return (
      <div className={cn("flex flex-row flex-wrap items-center gap-2.5 [&_.ant-input-search]:!w-[280px] [&_.ant-input-search]:!max-w-[280px] [&_.ant-select]:!w-40", className ?? "mb-4")}>
        {children}
        {activeCount > 0 ? (
          <Button onClick={onClear}>Limpar</Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className={cn("flex", className ?? "mb-3.5")}>
        <Badge count={activeCount} size="small" offset={[-2, 2]}>
          <Button icon={<FilterOutlined />} onClick={() => setOpen(true)}>
            Filtros
          </Button>
        </Badge>
      </div>
      <Modal
        title="Filtros"
        open={open}
        onCancel={() => setOpen(false)}
        destroyOnClose={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={onClear} disabled={activeCount === 0}>
              Limpar
            </Button>
            <Button type="primary" onClick={() => setOpen(false)}>
              Ver resultados
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 [&_.ant-input-search]:!w-full [&_.ant-input-affix-wrapper]:!w-full [&_.ant-select]:!w-full">
          {children}
        </div>
      </Modal>
    </>
  );
}
