import { useQuery } from "@tanstack/react-query";
import { Empty, Modal, Skeleton } from "antd";
import dayjs from "dayjs";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";

const LIMIT = 100;

export function CancelledOrdersModal({
  open,
  onClose,
  dayKey,
  dayLabel,
}: {
  open: boolean;
  onClose: () => void;
  dayKey: string;
  dayLabel: string;
}) {
  const filters = { lifecycle: "cancelled" as const, from: dayKey, to: dayKey };
  const query = useQuery({
    queryKey: queryKeys.orders.list(1, LIMIT, filters),
    queryFn: () => api.orders(1, LIMIT, true, filters),
    enabled: open,
  });
  const orders = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      title={
        <div>
          <p className="m-0 text-[16px] font-bold text-food-text">Pedidos cancelados</p>
          <p className="m-0 mt-0.5 text-[12px] font-normal text-food-muted">
            {dayLabel}
            {query.data ? ` · ${total} ${total === 1 ? "pedido" : "pedidos"}` : ""}
          </p>
        </div>
      }
    >
      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : query.isError ? (
        <Empty description="Não foi possível carregar os cancelamentos." />
      ) : orders.length === 0 ? (
        <Empty description="Nenhum pedido cancelado neste dia." />
      ) : (
        <ul className="m-0 flex max-h-[60vh] list-none flex-col gap-2.5 overflow-y-auto p-0 pe-1">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-2xl border border-food-border bg-food-chip/40 px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] font-extrabold tracking-[-0.01em] text-food-text">
                  #{order.code}
                </span>
                <span className="text-[12px] tabular-nums text-food-muted">
                  {dayjs(order.createdAt).format("HH:mm")}
                </span>
              </div>
              <p className="m-0 mt-0.5 truncate text-[12px] text-food-muted">
                {order.customerName || order.customerPhone || "Cliente"} ·{" "}
                {order.fulfillment === "delivery" ? "Entrega" : "Retirada"}
              </p>
              <div className="mt-2.5 rounded-xl bg-rose-500/8 px-3 py-2">
                <p className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-500">
                  Motivo
                </p>
                <p
                  className={
                    order.cancelReason
                      ? "m-0 mt-0.5 whitespace-pre-wrap text-[13px] text-food-text"
                      : "m-0 mt-0.5 text-[13px] italic text-food-muted"
                  }
                >
                  {order.cancelReason?.trim() || "Sem motivo informado"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
