import { Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import { PAYMENT_KIND_LABEL } from "../../lib/format";
import type { StorePaymentMethod } from "../../types";

export function PaymentMethodCard({
  method,
  onEdit,
  onDelete,
}: {
  method: StorePaymentMethod;
  onEdit: (method: StorePaymentMethod) => void;
  onDelete: (method: StorePaymentMethod) => void;
}) {
  return (
    <EntityCard
      tone={method.active ? "ready" : "idle"}
      kicker={method.active ? "Ativo" : "Inativo"}
      title={method.name}
      extra={
        <RowActions
          items={[
            { key: "edit", label: "Editar", onClick: () => onEdit(method) },
            {
              key: "delete",
              label: "Excluir",
              danger: true,
              onClick: () => onDelete(method),
            },
          ]}
        />
      }
      footer={
        <>
          <Tag color={method.kind === "cash" ? "green" : "blue"}>
            {PAYMENT_KIND_LABEL[method.kind]}
          </Tag>
          {method.kind === "cash" ? (
            <Tag color="gold">Pede troco</Tag>
          ) : null}
        </>
      }
    />
  );
}
