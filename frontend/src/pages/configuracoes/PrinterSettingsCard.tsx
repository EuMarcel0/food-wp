import { Alert, Card } from "antd";

export function PrinterSettingsCard() {
  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-xl"
      title="Impressão do cupom"
    >
      <p className="mb-3 text-sm leading-normal text-food-muted">
        A impressão roda no <strong>computador da cozinha</strong>, pelo diálogo
        do navegador. A API na nuvem não enxerga as impressoras instaladas neste
        PC.
      </p>
      <Alert
        type="info"
        showIcon
        message="Como imprimir na Elgin i8 (ou outra térmica)"
        description={
          <ol className="mb-0 mt-1 list-decimal space-y-1 pl-4 text-sm">
            <li>Abra o cupom do pedido e toque em Imprimir.</li>
            <li>
              No diálogo do Windows/Chrome, escolha a impressora (ex.:{" "}
              <strong>ELGIN i8</strong>).
            </li>
            <li>
              Para não escolher toda vez, defina essa impressora como{" "}
              <strong>padrão do Windows</strong> neste computador.
            </li>
          </ol>
        }
      />
    </Card>
  );
}
