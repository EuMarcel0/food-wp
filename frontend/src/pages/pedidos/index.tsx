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
  NEXT_STATUS,
  STATUS_COLOR,
  STATUS_LABEL,
  formatBRL,
  formatDate,
} from "../../lib/format";
import { useAuth } from "../../auth/AuthProvider";
import { displayName } from "../../lib/profile";
import type { Order, OrderStatus } from "../../types";

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
          className="filter-search"
          allowClear
          placeholder="Código, cliente ou item…"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
        />
        <Select
          className="filter-select"
          allowClear
          placeholder="Status"
          value={status}
          options={STATUS_OPTIONS}
          onChange={setStatus}
        />
        <Select
          className="filter-select"
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
      <div className="table-wrap list-table">
      <Table
        rowKey="id"
        loading={listQuery.isPending && !result}
        dataSource={orders}
        pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
          setPage(nextPage);
          setLimit(nextSize);
        })}
        scroll={{ x: 960 }}
        columns={[
          { title: "Código", dataIndex: "code", width: 100 },
          {
            title: "Cliente",
            render: (_, order) => order.customerName || order.customerPhone || "—",
          },
          {
            title: "Itens",
            render: (_, order) =>
              (order.items ?? [])
                .map((item) => `${item.quantity}x ${item.name}`)
                .join(", ") || "—",
          },
          {
            title: "Tipo",
            dataIndex: "fulfillment",
            width: 110,
            render: (value: Order["fulfillment"]) =>
              value === "delivery" ? "Entrega" : "Retirada",
          },
          {
            title: "Total",
            dataIndex: "totalCents",
            width: 120,
            render: (value: number) => formatBRL(value),
          },
          {
            title: "Status",
            dataIndex: "status",
            width: 150,
            render: (value: OrderStatus) => (
              <Tag color={STATUS_COLOR[value]}>{STATUS_LABEL[value]}</Tag>
            ),
          },
          {
            title: "Quando",
            dataIndex: "createdAt",
            width: 120,
            render: (value: string) => formatDate(value),
          },
          {
            title: "Ações",
            width: 72,
            align: "center",
            render: (_, order) => {
              const next = NEXT_STATUS[order.status];
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
      <div className="list-cards">
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
