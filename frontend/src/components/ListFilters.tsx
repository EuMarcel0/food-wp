import { type ReactNode, useState } from "react";
import { FilterOutlined } from "@ant-design/icons";
import { Badge, Button, Modal } from "antd";
import { useMediaQuery } from "../lib/hooks";

export function ListFilters({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const isMobile = useMediaQuery("(max-width: 991px)");
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return (
      <div className="mb-4 flex flex-row flex-wrap items-center gap-2.5">
        {children}
        {activeCount > 0 ? (
          <Button onClick={onClear}>Limpar</Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="mb-3.5 flex">
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
