import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Input, Select, Table, Tag } from "antd";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { OrderCard } from "./OrderCard";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/hooks";
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
} from "../../lib/format";
import { useAuth } from "../../auth/AuthProvider";
import { displayName } from "../../lib/profile";
import type { Order, OrderStatus } from "../../types";
import { filterSearch, filterSelect, listCards, tableClass, tableWrap } from "../../ui";

const STATUS_OPTIONS = (
  Object.entries(STATUS_LABEL) as [OrderStatus, string][]
).map(([value, label]) => ({ value, label }));

export function OrdersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

  const statusMutation = useMutation({
    mutationFn: ({ order, next }: { order: Order; next: OrderStatus }) =>
      api.updateOrderStatus(order.id, next, displayName(user)),
    onSuccess: async (updated) => {
      toast.success(`Pedido #${updated.code} → ${STATUS_LABEL[updated.status]}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
      ]);
    },
  });

  function changeStatus(order: Order, next: OrderStatus) {
    statusMutation.mutate({ order, next });
  }

  const updatingId =
    statusMutation.isPending && statusMutation.variables
      ? statusMutation.variables.order.id
      : null;

  return (
    <>
      <PageHeader
        kicker="Fila"
        title="Pedidos"
        subtitle="Ao mudar o status, o cliente recebe o aviso no WhatsApp."
      />
      <ListFilters
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
      <div className={tableWrap}>
      <Table
        rowKey="id"
        className={`${tableClass} [&_.ant-table-cell-align-center]:whitespace-nowrap`}
        loading={listQuery.isPending && !result}
        dataSource={orders}
        tableLayout="fixed"
        pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
          setPage(nextPage);
          setLimit(nextSize);
        })}
        scroll={{ x: 1280 }}
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
                    return item.notes ? `${line} (obs.: ${item.notes})` : line;
                  })
                  .join(", ") || "—";
              return (
                <span className="line-clamp-2 leading-snug break-words" title={text}>
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
            width: 120,
            align: "center",
            render: (value: Order["paymentMethod"]) =>
              value ? (
                <Tag color={PAYMENT_COLOR[value]}>{PAYMENT_LABEL[value]}</Tag>
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
              <Tag color={STATUS_COLOR[value]}>{STATUS_LABEL[value]}</Tag>
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
    </>
  );
}
