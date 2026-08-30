import { useEffect, useState } from "react";
import { Form, InputNumber, Modal } from "antd";
import type { Order } from "../../types";

export function PrepTimeModal({
  order,
  open,
  submitting,
  defaultMinutes,
  onCancel,
  onConfirm,
}: {
  order: Order | null;
  open: boolean;
  submitting: boolean;
  defaultMinutes?: number | null;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const invalid = !minutes || minutes < 1;

  useEffect(() => {
    if (open) {
      const preset = Number(defaultMinutes);
      setMinutes(Number.isFinite(preset) && preset >= 1 ? Math.round(preset) : null);
      setTouched(false);
    }
  }, [open, order?.id, defaultMinutes]);

  return (
    <Modal
      title={order ? `Tempo de preparo · #${order.code}` : "Tempo de preparo"}
      open={open}
      onCancel={onCancel}
      onOk={() => {
        setTouched(true);
        if (!minutes || minutes < 1) return;
        onConfirm(minutes);
      }}
      okText="Colocar em preparo"
      cancelText="Cancelar"
      confirmLoading={submitting}
      okButtonProps={{ disabled: submitting || invalid }}
      destroyOnHidden
      centered
    >
      <p className="mb-4 text-sm leading-normal text-food-muted">
        Informe quanto tempo esse pedido deve levar. O cliente recebe o prazo no
        WhatsApp.
      </p>
      <Form layout="vertical" requiredMark>
        <Form.Item
          label="Tempo estimado"
          required
          validateStatus={touched && invalid ? "error" : undefined}
          help={touched && invalid ? "Informe o tempo em minutos." : undefined}
        >
          <InputNumber
            min={1}
            max={480}
            step={5}
            value={minutes ?? undefined}
            addonAfter="minutos"
            style={{ width: "100%", maxWidth: 240 }}
            onChange={(value) => {
              setMinutes(typeof value === "number" ? value : null);
              setTouched(true);
            }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
