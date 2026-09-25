import { useQuery } from "@tanstack/react-query";
import { Modal, Tag, Timeline } from "antd";
import { api } from "../../lib/api";
import { formatBRL, formatDate, STATUS_LABEL } from "../../lib/format";
import type { Order, OrderLog, OrderLogAction } from "../../types";

const ACTION_LABEL: Record<OrderLogAction, string> = {
  order_created: "Pedido criado",
  items_updated: "Itens alterados",
  payment_updated: "Pagamento alterado",
  status_updated: "Status alterado",
};

const ACTION_COLOR: Record<OrderLogAction, string> = {
  order_created: "green",
  items_updated: "blue",
  payment_updated: "purple",
  status_updated: "orange",
};

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? formatBRL(n) : "—";
}

function renderItems(data: Record<string, unknown> | null | undefined) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return <span className="text-food-muted">Sem itens</span>;
  return (
    <ul className="m-0 list-disc pl-4">
      {items.map((raw, index) => {
        const item = raw as Record<string, unknown>;
        const qty = Number(item.quantity) || 0;
        const unit = Number(item.unitPriceCents) || 0;
        const name = String(item.name ?? "Item");
        const notes = item.notes ? ` (obs.: ${item.notes})` : "";
        return (
          <li key={`${name}-${index}`}>
            {qty}x {name}
            {notes} — {formatBRL(unit)}
            {qty > 1 ? ` · linha ${formatBRL(qty * unit)}` : ""}
          </li>
        );
      })}
    </ul>
  );
}

function SnapshotBlock({
  title,
  data,
  action,
}: {
  title: string;
  data: Record<string, unknown> | null;
  action: OrderLogAction;
}) {
  if (!data) {
    return (
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-food-muted">
          {title}
        </div>
        <div className="text-sm text-food-muted">—</div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-food-border bg-food-surface p-2.5 text-sm">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-food-muted">
        {title}
      </div>
      {(action === "items_updated" || action === "order_created") && (
        <>
          {renderItems(data)}
          <div className="mt-2 flex flex-col gap-0.5 text-xs text-food-muted">
            <span>Subtotal: {money(data.subtotalCents)}</span>
            <span>Entrega: {money(data.deliveryFeeCents)}</span>
            <span>Total: {money(data.totalCents)}</span>
          </div>
        </>
      )}
      {action === "payment_updated" && (
        <div className="flex flex-col gap-0.5">
          <span>
            Forma:{" "}
            {String(data.paymentMethodLabel || data.paymentMethod || "—")}
          </span>
          {data.changeForCents != null ? (
            <span>Troco para: {money(data.changeForCents)}</span>
          ) : null}
        </div>
      )}
      {action === "status_updated" && (
        <span>
          Status:{" "}
          {STATUS_LABEL[data.status as keyof typeof STATUS_LABEL] ??
            String(data.status ?? "—")}
        </span>
      )}
    </div>
  );
}

function LogEntry({ log }: { log: OrderLog }) {
  return (
    <div className="flex flex-col gap-2 pb-1">
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={ACTION_COLOR[log.action]}>{ACTION_LABEL[log.action]}</Tag>
        <span className="text-xs text-food-muted">{formatDate(log.createdAt)}</span>
        <span className="text-xs text-food-muted">· {log.actorName}</span>
      </div>
      <div className="text-sm font-medium text-food-text">{log.summary}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <SnapshotBlock title="Antes" data={log.beforeData} action={log.action} />
        <SnapshotBlock title="Depois" data={log.afterData} action={log.action} />
      </div>
    </div>
  );
}

export function OrderLogsModal({
  order,
  open,
  onClose,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
}) {
  const logsQuery = useQuery({
    queryKey: ["orders", "logs", order?.id],
    queryFn: () => api.orderLogs(order!.id),
    enabled: open && Boolean(order?.id),
  });

  const items = logsQuery.data?.items ?? [];

  return (
    <Modal
      title={order ? `Logs · Pedido #${order.code}` : "Logs do pedido"}
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnHidden
      centered
    >
      {logsQuery.isLoading ? (
        <p className="text-sm text-food-muted">Carregando histórico…</p>
      ) : logsQuery.isError ? (
        <p className="text-sm text-red-600">
          {(logsQuery.error as Error)?.message || "Falha ao carregar logs."}
        </p>
      ) : !items.length ? (
        <p className="text-sm text-food-muted">
          Nenhuma alteração registrada ainda para este pedido.
        </p>
      ) : (
        <Timeline
          items={items.map((log) => ({
            key: log.id,
            children: <LogEntry log={log} />,
          }))}
        />
      )}
    </Modal>
  );
}
