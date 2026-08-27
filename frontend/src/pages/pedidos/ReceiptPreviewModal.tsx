import { Button, Modal } from "antd";
import { ReceiptTicket } from "./ReceiptTicket";
import type { Order, Store } from "../../types";

export function ReceiptPreviewModal({
  order,
  store,
  open,
  onClose,
}: {
  order: Order | null;
  store?: Store;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      title={order ? `Cupom · #${order.code}` : "Cupom"}
      open={open}
      onCancel={onClose}
      footer={
        <Button type="primary" onClick={onClose}>
          Fechar
        </Button>
      }
      width={420}
      centered
      destroyOnHidden
    >
      {order ? (
        <div
          className="flex justify-center rounded-xl py-4"
          style={{ background: "#1f1f1f" }}
        >
          <ReceiptTicket order={order} store={store} />
        </div>
      ) : null}
      <p className="mb-0 mt-3 text-center text-xs text-food-muted">
        Prévia em 80 mm. Ainda não envia para a impressora térmica.
      </p>
    </Modal>
  );
}
