import { type ReactNode, useState } from "react";
import { FilterOutlined } from "@ant-design/icons";
import { Badge, Button, Modal } from "antd";
import { useMediaQuery } from "../lib/hooks";
import "./list-filters.css";

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
      <div className="filter-bar filter-bar-desktop">
        {children}
        {activeCount > 0 ? (
          <Button onClick={onClear}>Limpar</Button>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="filter-bar-mobile">
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
          <div className="filter-modal-footer">
            <Button onClick={onClear} disabled={activeCount === 0}>
              Limpar
            </Button>
            <Button type="primary" onClick={() => setOpen(false)}>
              Ver resultados
            </Button>
          </div>
        }
      >
        <div className="filter-modal-fields">{children}</div>
      </Modal>
    </>
  );
}
