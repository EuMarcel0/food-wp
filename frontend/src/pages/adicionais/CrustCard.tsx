import { Tag } from "antd";
import { EntityCard } from "../../components/EntityCard";
import { RowActions } from "../../components/RowActions";
import { formatReais } from "../../lib/format";
import { entityPrice } from "../../ui";
import type { Crust } from "../../types";

export function CrustCard({
  crust,
  onEdit,
  onDelete,
}: {
  crust: Crust;
  onEdit: (crust: Crust) => void;
  onDelete: (crust: Crust) => void;
}) {
  return (
    <EntityCard
      tone="ready"
      kicker={crust.addsPrice ? "Soma no valor" : "Incluído"}
      title={crust.name}
      extra={
        <RowActions
          items={[
            { key: "edit", label: "Editar", onClick: () => onEdit(crust) },
            {
              key: "delete",
              label: "Excluir",
              danger: true,
              onClick: () => onDelete(crust),
            },
          ]}
        />
      }
      footer={
        <>
          <Tag color={crust.pizzaKind === "doce" ? "magenta" : "blue"}>
            {crust.pizzaKind === "doce" ? "Doce" : "Salgada"}
          </Tag>
          <Tag color={crust.addsPrice ? "gold" : "default"}>
            {crust.addsPrice ? "Soma no valor da pizza" : "Sem acréscimo"}
          </Tag>
          {crust.addsPrice ? (
            <strong className={entityPrice}>{formatReais(crust.price)}</strong>
          ) : null}
        </>
      }
    />
  );
}
