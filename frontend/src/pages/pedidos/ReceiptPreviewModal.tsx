import { useEffect, useRef, useState } from "react";
import { PrinterOutlined } from "@ant-design/icons";
import { Alert, Button, Modal } from "antd";
import { formatCnpj } from "../../lib/format";
import {
  fetchPrintAgentHealth,
  getPrintAgentToken,
  printOrderViaAgent,
} from "../../lib/printAgent";
import { toast } from "../../lib/toast";
import { ReceiptTicket } from "./ReceiptTicket";
import type { Order, Store } from "../../types";

function printTicketFallback(node: HTMLElement, title: string) {
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
  const [agentOnline, setAgentOnline] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      if (!getPrintAgentToken()) {
        if (!cancelled) setAgentOnline(false);
        return;
      }
      try {
        const health = await fetchPrintAgentHealth();
        if (!cancelled) setAgentOnline(Boolean(health.ok));
      } catch {
        if (!cancelled) setAgentOnline(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handlePrint() {
    if (!order) return;

    if (agentOnline && getPrintAgentToken()) {
      setPrinting(true);
      try {
        await printOrderViaAgent({
          order,
          store: store
            ? {
                ...store,
                cnpj: store.cnpj ? formatCnpj(store.cnpj) : store.cnpj,
              }
            : undefined,
        });
        toast.success("Cupom enviado para a impressora.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Falha ao imprimir no agente.",
        );
      } finally {
        setPrinting(false);
      }
      return;
    }

    const ticket = ticketRef.current?.querySelector(
      ".receipt-ticket",
    ) as HTMLElement | null;
    if (!ticket) return;
    printTicketFallback(ticket, `Cupom #${order.code}`);
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
            disabled={!order}
            loading={printing}
            onClick={() => void handlePrint()}
          >
            Imprimir
          </Button>
        </div>
      }
      width={420}
      centered
      destroyOnHidden
    >
      {!agentOnline ? (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          message="Agente de impressão offline"
          description="Com o agente no PC da cozinha (Configurações → Impressão), o cupom sai direto na térmica sem cortar. Enquanto offline, o botão usa o diálogo do navegador."
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
        {agentOnline
          ? "Prévia 80 mm · impressão via agente local (ESC/POS)."
          : "Prévia 80 mm · fallback: diálogo do navegador."}
      </p>
    </Modal>
  );
}
