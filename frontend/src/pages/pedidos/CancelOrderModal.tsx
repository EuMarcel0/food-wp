import { useEffect, useMemo, useState } from "react";
import { Form, Input, Modal } from "antd";
import type { Order } from "../../types";

export function CancelOrderModal({
  order,
  open,
  submitting,
  onCancel,
  onConfirm,
}: {
  order: Order | null;
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [codeInput, setCodeInput] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setCodeInput("");
      setReason("");
      setTouched(false);
    }
  }, [open, order?.id]);

  const expectedCode = (order?.code ?? "").trim().toUpperCase();
  const codeOk =
    codeInput.trim().replace(/^#/, "").toUpperCase() === expectedCode;
  const reasonOk = reason.trim().length >= 3;
  const canConfirm = Boolean(order) && codeOk && reasonOk && !submitting;

  const codeError = useMemo(() => {
    if (!touched || !codeInput.trim()) return undefined;
    if (!codeOk) return `Digite exatamente o código ${order?.code ?? ""}.`;
    return undefined;
  }, [touched, codeInput, codeOk, order?.code]);

  const reasonError = useMemo(() => {
    if (!touched) return undefined;
    if (!reason.trim()) return "Informe o motivo do cancelamento.";
    if (!reasonOk) return "Motivo muito curto (mín. 3 caracteres).";
    return undefined;
  }, [touched, reason, reasonOk]);

  return (
    <Modal
      title={order ? `Cancelar pedido #${order.code}` : "Cancelar pedido"}
      open={open}
      onCancel={onCancel}
      onOk={() => {
        setTouched(true);
        if (!canConfirm) return;
        onConfirm(reason.trim());
      }}
      okText="Cancelar pedido"
      cancelText="Voltar"
      confirmLoading={submitting}
      okButtonProps={{ danger: true, disabled: !canConfirm }}
      destroyOnHidden
      centered
    >
      <p className="mb-4 text-sm text-food-muted">
        Para confirmar, digite o <strong>código do pedido</strong> e o{" "}
        <strong>motivo</strong> do cancelamento. O cliente pode ser notificado no
        WhatsApp.
      </p>
      <Form layout="vertical" requiredMark>
        <Form.Item
          label={`Código do pedido (${order?.code ?? "—"})`}
          required
          validateStatus={codeError ? "error" : undefined}
          help={codeError}
        >
          <Input
            autoFocus
            placeholder={order?.code ?? "Código"}
            value={codeInput}
            onChange={(event) => {
              setCodeInput(event.target.value);
              setTouched(true);
            }}
            onPressEnter={() => {
              setTouched(true);
              if (canConfirm) onConfirm(reason.trim());
            }}
          />
        </Form.Item>
        <Form.Item
          label="Motivo do cancelamento"
          required
          validateStatus={reasonError ? "error" : undefined}
          help={reasonError ?? "Obrigatório para liberar a confirmação."}
        >
          <Input.TextArea
            rows={3}
            maxLength={240}
            showCount
            placeholder="Ex.: cliente desistiu, endereço fora da área…"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setTouched(true);
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
