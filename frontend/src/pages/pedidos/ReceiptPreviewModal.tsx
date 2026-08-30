import { useEffect, useRef, useState } from "react";
import { PrinterOutlined } from "@ant-design/icons";
import { Alert, Button, Modal } from "antd";
import { getDefaultPrinter } from "../../lib/printer";
import { ReceiptTicket } from "./ReceiptTicket";
import type { Order, Store } from "../../types";

function printTicketNode(node: HTMLElement, title: string) {
  const win = window.open(
    "",
    "_blank",
    "noopener,noreferrer,width=420,height=720",
  );
  if (!win) {
    window.print();
    return;
  }

  const safeTitle = title.replace(/[<>&"]/g, "");
  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    @page { margin: 4mm; size: 80mm auto; }
    html, body { margin: 0; padding: 0; background: #fff; }
  </style>
</head>
<body>${node.outerHTML}</body>
</html>`);
  win.document.close();

  const trigger = () => {
    win.focus();
    win.print();
    win.close();
  };
  if (win.document.readyState === "complete") {
    window.setTimeout(trigger, 50);
  } else {
    win.onload = () => window.setTimeout(trigger, 50);
  }
}

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
  const ticketRef = useRef<HTMLDivElement>(null);
  const [printer, setPrinter] = useState("");

  useEffect(() => {
    if (open) setPrinter(getDefaultPrinter());
  }, [open]);

  const canPrint = Boolean(printer);

  function handlePrint() {
    if (!canPrint || !ticketRef.current || !order) return;
    const ticket = ticketRef.current.querySelector(
      ".receipt-ticket",
    ) as HTMLElement | null;
    if (!ticket) return;
    printTicketNode(ticket, `Cupom #${order.code}`);
  }

  return (
    <Modal
      title={order ? `Cupom · #${order.code}` : "Cupom"}
      open={open}
      onCancel={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose}>Fechar</Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            disabled={!canPrint || !order}
            onClick={handlePrint}
          >
            Imprimir
          </Button>
        </div>
      }
      width={420}
      centered
      destroyOnHidden
    >
      {!canPrint ? (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          message="Configure a impressora padrão em Configurações para imprimir."
        />
      ) : null}

      {order ? (
        <div
          ref={ticketRef}
          className="receipt-print-root flex justify-center rounded-xl py-4"
          style={{ background: "#1f1f1f" }}
        >
          <ReceiptTicket order={order} store={store} />
        </div>
      ) : null}

      <p className="mb-0 mt-3 text-center text-xs text-food-muted">
        {canPrint
          ? `Prévia 80 mm · impressora: ${printer}`
          : "Prévia em 80 mm."}
      </p>
    </Modal>
  );
}
