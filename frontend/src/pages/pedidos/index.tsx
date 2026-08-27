import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Input, Pagination, Select, Table, Tag } from "antd";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { OrderCard } from "./OrderCard";
import { PrepTimeModal } from "./PrepTimeModal";
import { api } from "../../lib/api";
import { useDebouncedValue, useMediaQuery } from "../../lib/hooks";
import { PAGE_SIZE, clampPage, serverPagination } from "../../lib/pagination";
import { queryKeys } from "../../lib/queryKeys";
import { toast } from "../../lib/toast";
import { supabase } from "../../lib/supabase";
import {
  nextStatus,
  PAYMENT_COLOR,
  PAYMENT_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  formatBRL,
  formatDate,
  addonLabel,
} from "../../lib/format";
import { useAuth } from "../../auth/AuthProvider";
import { displayName } from "../../lib/profile";
import type { Order, OrderStatus } from "../../types";
import { cn } from "../../lib/cn";
import { filterSearch, filterSelect, listCards, tableClass, tableWrap } from "../../ui";

function useOrdersGridHeight(enabled: boolean) {
  const shellRef = useRef<HTMLDivElement>(null);
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(400);

  useLayoutEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    const area = tableAreaRef.current;
    if (!shell || !area) return;

    const measure = () => {
      const top = shell.getBoundingClientRect().top;
      const content = document.getElementById("conteudo");
      const padBottom = content
        ? parseFloat(getComputedStyle(content).paddingBottom) || 0
        : 12;
      const shellHeight = Math.floor(window.innerHeight - top - padBottom);
      if (shellHeight <= 0) return;
      shell.style.height = `${shellHeight}px`;
      const header =
        area.querySelector<HTMLElement>(".ant-table-header") ??
        area.querySelector<HTMLElement>(".ant-table-thead");
      const next = Math.floor(
        area.clientHeight - (header?.getBoundingClientRect().height ?? 47) - 2,
      );
      const clamped = Math.max(120, next);
      setBodyHeight((prev) => (Math.abs(prev - clamped) < 1 ? prev : clamped));
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    observer.observe(area);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [enabled]);

  return { shellRef, tableAreaRef, bodyHeight };
}

const STATUS_OPTIONS = (
  Object.entries(STATUS_LABEL) as [OrderStatus, string][]
).map(([value, label]) => ({ value, label }));

export function OrdersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const { shellRef, tableAreaRef, bodyHeight } = useOrdersGridHeight(isDesktop);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [qInput, setQInput] = useState("");
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [fulfillment, setFulfillment] = useState<
    Order["fulfillment"] | undefined
  >();
  const q = useDebouncedValue(qInput.trim(), 300);
  const filters = { q: q || undefined, status, fulfillment };
  const activeCount = [q, status, fulfillment].filter(Boolean).length;

  useEffect(() => {
    setPage(1);
  }, [q, status, fulfillment]);

  const listQuery = useQuery({
    queryKey: queryKeys.orders.list(page, limit, filters),
    queryFn: () => api.orders(page, limit, true, filters),
    placeholderData: keepPreviousData,
  });

  const result = listQuery.data;
  const orders = result?.items ?? [];
  const total = result?.total ?? 0;

  useEffect(() => {
    if (!result) return;
    const nextPage = clampPage(page, limit, result.total);
    if (nextPage !== page) setPage(nextPage);
  }, [limit, page, result]);

  useEffect(() => {
    async function refresh() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
      ]);
    }

    const client = supabase;
    if (!client) {
      const timer = window.setInterval(() => {
        void refresh();
      }, 8000);
      return () => window.clearInterval(timer);
    }

    const channel = client
      .channel("orders-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [queryClient]);

  const [prepOrder, setPrepOrder] = useState<Order | null>(null);

  const statusMutation = useMutation({
    mutationFn: ({
      order,
      next,
      prepMinutes,
    }: {
      order: Order;
      next: OrderStatus;
      prepMinutes?: number;
    }) =>
      api.updateOrderStatus(
        order.id,
        next,
        displayName(user),
        prepMinutes,
      ),
    onSuccess: async (updated) => {
      toast.success(`Pedido #${updated.code} → ${STATUS_LABEL[updated.status]}`);
      setPrepOrder(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
      ]);
    },
  });

  function changeStatus(order: Order, next: OrderStatus) {
    if (next === "preparing") {
      setPrepOrder(order);
      return;
    }
    statusMutation.mutate({ order, next });
  }

  const updatingId =
    statusMutation.isPending && statusMutation.variables
      ? statusMutation.variables.order.id
      : null;

  const pagination = serverPagination(page, limit, total, (nextPage, nextSize) => {
    setPage(nextPage);
    setLimit(nextSize);
  });

  return (
    <div className="orders-page flex h-full min-h-0 flex-1 flex-col max-lg:h-auto max-lg:flex-none">
      <PageHeader
        className="mb-3 shrink-0"
        kicker="Fila"
        kickerClassName="!text-food-muted"
        title="Pedidos"
        subtitle="Ao mudar o status, o cliente recebe o aviso no WhatsApp."
      />
      <ListFilters
        className="mb-3 shrink-0"
        activeCount={activeCount}
        onClear={() => {
          setQInput("");
          setStatus(undefined);
          setFulfillment(undefined);
        }}
      >
        <Input.Search
          className={filterSearch}
          allowClear
          placeholder="Código, cliente ou item…"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
        />
        <Select
          className={filterSelect}
          allowClear
          placeholder="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        <Select
          className={filterSelect}
          allowClear
          placeholder="Tipo"
          value={fulfillment}
          onChange={setFulfillment}
          options={[
            { value: "delivery", label: "Entrega" },
            { value: "pickup", label: "Retirada" },
          ]}
        />
      </ListFilters>
      <div ref={shellRef} className={cn(tableWrap, "flex min-h-0 flex-1 flex-col")}>
      <div ref={tableAreaRef} className="min-h-0 flex-1 overflow-hidden">
      <Table
        rowKey="id"
        className={`${tableClass} orders-grid-fill [&_.ant-table-cell-align-center]:whitespace-nowrap`}
        loading={listQuery.isPending && !result}
        dataSource={orders}
        tableLayout="fixed"
        pagination={false}
        scroll={{ x: 1280, y: bodyHeight }}
        columns={[
          { title: "Código", dataIndex: "code", width: 88 },
          {
            title: "Cliente",
            width: 160,
            ellipsis: true,
            render: (_, order) => order.customerName || order.customerPhone || "—",
          },
          {
            title: "Itens",
            render: (_, order) => {
              const text =
                (order.items ?? [])
                  .map((item) => {
                    const line = `${item.quantity}x ${item.name}`;
                    const withNotes = item.notes ? `${line} (obs.: ${item.notes})` : line;
                    const addons = addonLabel(item.extras);
                    return addons ? `${withNotes}\n${addons}` : withNotes;
                  })
                  .join("\n") || "—";
              return (
                <span className="line-clamp-4 whitespace-pre-line leading-snug break-words" title={text}>
                  {text}
                </span>
              );
            },
          },
          {
            title: "Obs.",
            ellipsis: true,
            width: 140,
            render: (_, order) => order.notes || "—",
          },
          {
            title: "Tipo",
            dataIndex: "fulfillment",
            width: 108,
            align: "center",
            render: (value: Order["fulfillment"]) =>
              value === "delivery" ? "Entrega" : "Retirada",
          },
          {
            title: "Pagamento",
            dataIndex: "paymentMethod",
            width: 132,
            align: "center",
            render: (value: Order["paymentMethod"], order) =>
              value ? (
                <span className="inline-flex flex-col items-center gap-0.5">
                  <Tag color={PAYMENT_COLOR[value]}>{PAYMENT_LABEL[value]}</Tag>
                  {value === "cash" && order.changeForCents != null ? (
                    <span className="text-[11px] font-medium text-food-muted">
                      {order.changeForCents
                        ? `Troco p/ ${formatBRL(order.changeForCents)}`
                        : "Sem troco"}
                    </span>
                  ) : null}
                </span>
              ) : (
                "—"
              ),
          },
          {
            title: "Total",
            dataIndex: "totalCents",
            width: 112,
            align: "center",
            render: (value: number) => formatBRL(value),
          },
          {
            title: "Status",
            dataIndex: "status",
            width: 148,
            align: "center",
            render: (value: OrderStatus) => (
              <Tag color={value === "received" ? "default" : STATUS_COLOR[value]}>
                {STATUS_LABEL[value]}
              </Tag>
            ),
          },
          {
            title: "Quando",
            dataIndex: "createdAt",
            width: 112,
            align: "center",
            render: (value: string) => formatDate(value),
          },
          {
            title: "Ações",
            width: 76,
            align: "center",
            fixed: "right",
            render: (_, order) => {
              const next = nextStatus(order.status, order.fulfillment);
              return (
                <RowActions
                  disabled={order.status === "delivered"}
                  items={[
                    next
                      ? {
                          key: "next",
                          label: STATUS_LABEL[next],
                          disabled: updatingId === order.id,
                          onClick: () => changeStatus(order, next),
                        }
                      : null,
                    order.status !== "cancelled" && order.status !== "delivered"
                      ? {
                          key: "cancel",
                          label: "Cancelar",
                          danger: true,
                          disabled: updatingId === order.id,
                          onClick: () => changeStatus(order, "cancelled"),
                        }
                      : null,
                  ]}
                />
              );
            },
          },
        ]}
      />
      </div>
      <div className="flex shrink-0 items-center justify-end border-t border-food-border">
        <Pagination {...pagination} />
      </div>
      </div>
      <div className={listCards}>
        <MobileCardList
          loading={listQuery.isPending && !result}
          isEmpty={orders.length === 0}
          empty={
            activeCount > 0
              ? "Nenhum pedido encontrado com esses filtros."
              : "Quando o cliente pedir no WhatsApp, a fila aparece aqui."
          }
          pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
            setPage(nextPage);
            setLimit(nextSize);
          })}
        >
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              updating={updatingId === order.id}
              onChangeStatus={changeStatus}
            />
          ))}
        </MobileCardList>
      </div>
      <PrepTimeModal
        order={prepOrder}
        open={Boolean(prepOrder)}
        submitting={statusMutation.isPending && Boolean(prepOrder)}
        onCancel={() => {
          if (!statusMutation.isPending) setPrepOrder(null);
        }}
        onConfirm={(minutes) => {
          if (!prepOrder) return;
          statusMutation.mutate({
            order: prepOrder,
            next: "preparing",
            prepMinutes: minutes,
          });
        }}
      />
    </div>
  );
}
