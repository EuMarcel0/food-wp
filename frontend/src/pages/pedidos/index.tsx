import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button, DatePicker, Input, Select, Table, Tag, Tooltip } from "antd";
import { FileTextOutlined, HistoryOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { OrderCard } from "./OrderCard";
import { OrderEditItemsModal } from "./OrderEditItemsModal";
import { OrderItemsLeaders } from "./OrderItemsLeaders";
import { OrderLogsModal } from "./OrderLogsModal";
import { PrepTimeModal } from "./PrepTimeModal";
import { ReceiptPreviewModal } from "./ReceiptPreviewModal";
import { OrderPaymentSelect } from "./OrderPaymentSelect";
import { api } from "../../lib/api";
import { useDebouncedValue, useMediaQuery } from "../../lib/hooks";
import { PAGE_SIZE, clampPage, serverPagination } from "../../lib/pagination";
import { queryKeys } from "../../lib/queryKeys";
import { toast } from "../../lib/toast";
import { supabase } from "../../lib/supabase";
import {
  nextStatus,
  STATUS_COLOR,
  STATUS_LABEL,
  statusActionLabel,
  formatBRL,
  formatDate,
  orderPaymentLabel,
} from "../../lib/format";
import { useAuth } from "../../auth/AuthProvider";
import { displayName } from "../../lib/profile";
import type { Order, OrderStatus, StorePaymentMethod } from "../../types";
import { FillTable } from "../../components/FillTable";
import { useTableGridHeight } from "../../lib/useTableGridHeight";
import { filterSearch, filterSelect, listCards, listPage, tableClass, tableGridFill } from "../../ui";

const STATUS_OPTIONS = (
  Object.entries(STATUS_LABEL) as [OrderStatus, string][]
).map(([value, label]) => ({ value, label }));

function todayRange(): [Dayjs, Dayjs] {
  const today = dayjs().startOf("day");
  return [today, today];
}

export function OrdersPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const { shellRef, tableAreaRef, bodyHeight } = useTableGridHeight(isDesktop);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [qInput, setQInput] = useState("");
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [fulfillment, setFulfillment] = useState<
    Order["fulfillment"] | undefined
  >();
  const [dateRange, setDateRange] = useState<
    [Dayjs | null, Dayjs | null] | null
  >(() => todayRange());
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const q = useDebouncedValue(qInput.trim(), 300);
  const from = dateRange?.[0]?.format("YYYY-MM-DD");
  const to = dateRange?.[1]?.format("YYYY-MM-DD");
  const filters = {
    q: q || undefined,
    status,
    fulfillment,
    from: from || undefined,
    to: to || undefined,
  };
  const activeCount = [q, status, fulfillment, from, to].filter(Boolean).length;

  useEffect(() => {
    setPage(1);
  }, [q, status, fulfillment, from, to]);

  const listQuery = useQuery({
    queryKey: queryKeys.orders.list(page, limit, filters),
    queryFn: () => api.orders(page, limit, true, filters),
    placeholderData: keepPreviousData,
  });
  const storeQuery = useQuery({
    queryKey: queryKeys.store,
    queryFn: api.store,
  });
  const paymentMethodsQuery = useQuery({
    queryKey: queryKeys.paymentMethods.list(1, 100, { active: true }),
    queryFn: () => api.listPaymentMethods(1, 100, { active: true }),
  });
  const paymentMethods = paymentMethodsQuery.data?.items ?? [];

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
        queryClient.invalidateQueries({ queryKey: ["orders", "stats"] }),
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
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [logsOrder, setLogsOrder] = useState<Order | null>(null);

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
        queryClient.invalidateQueries({ queryKey: ["orders", "stats"] }),
      ]);
    },
  });

  const paymentMutation = useMutation({
    mutationFn: ({
      order,
      method,
    }: {
      order: Order;
      method: StorePaymentMethod;
    }) =>
      api.updateOrderPayment(order.id, {
        paymentMethod: method.kind,
        paymentMethodLabel: method.name,
        changeForCents: method.kind === "cash" ? undefined : null,
        actorName: displayName(user),
      }),
    onSuccess: async (updated) => {
      toast.success(
        `Pedido #${updated.code}: pagamento → ${orderPaymentLabel(updated) ?? "atualizado"}`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
  });

  const itemsMutation = useMutation({
    mutationFn: ({
      order,
      items,
    }: {
      order: Order;
      items: {
        id?: string;
        productId?: string | null;
        name: string;
        quantity: number;
        unitPriceCents: number;
        notes?: string | null;
      }[];
    }) =>
      api.updateOrderItems(order.id, {
        items,
        actorName: displayName(user),
      }),
    onSuccess: async (updated) => {
      toast.success(`Pedido #${updated.code}: itens atualizados`);
      setEditOrder(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
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
    (statusMutation.isPending && statusMutation.variables
      ? statusMutation.variables.order.id
      : null) ||
    (paymentMutation.isPending && paymentMutation.variables
      ? paymentMutation.variables.order.id
      : null) ||
    (itemsMutation.isPending && itemsMutation.variables
      ? itemsMutation.variables.order.id
      : null);

  const pagination = serverPagination(page, limit, total, (nextPage, nextSize) => {
    setPage(nextPage);
    setLimit(nextSize);
  });

  return (
    <div className={listPage}>
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
          setDateRange(null);
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
        <DatePicker.RangePicker
          allowClear
          format="DD/MM/YYYY"
          placeholder={["Data início", "Data fim"]}
          value={dateRange}
          onChange={(dates) => setDateRange(dates)}
          inputReadOnly={!isDesktop}
          placement="bottomLeft"
          getPopupContainer={() => document.body}
        />
      </ListFilters>
      <FillTable
        shellRef={shellRef}
        tableAreaRef={tableAreaRef}
        pagination={pagination}
      >
      <Table
        rowKey="id"
        className={`${tableClass} ${tableGridFill} [&_.ant-table-cell-align-center]:whitespace-nowrap`}
        loading={listQuery.isPending && !result}
        dataSource={orders}
        tableLayout="fixed"
        pagination={false}
        scroll={{ x: 1580, y: bodyHeight }}
        columns={[
          { title: "Código", dataIndex: "code", width: 88 },
          {
            title: "Cliente",
            width: 150,
            ellipsis: true,
            render: (_, order) => order.customerName || order.customerPhone || "—",
          },
          {
            title: "Itens",
            width: 320,
            render: (_, order) => (
              <OrderItemsLeaders items={order.items ?? []} />
            ),
          },
          {
            title: "Obs.",
            width: 260,
            render: (_, order) =>
              order.notes ? (
                <span className="whitespace-normal break-words">{order.notes}</span>
              ) : (
                "—"
              ),
          },
          {
            title: "Impressão",
            width: 96,
            align: "center",
            render: (_, order) => (
              <Tooltip title="Ver cupom">
                <Button
                  type="text"
                  aria-label={`Ver cupom do pedido ${order.code}`}
                  icon={<FileTextOutlined />}
                  onClick={() => setReceiptOrder(order)}
                />
              </Tooltip>
            ),
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
            width: 188,
            align: "center",
            render: (_value: Order["paymentMethod"], order) => (
              <OrderPaymentSelect
                order={order}
                methods={paymentMethods}
                loading={paymentMethodsQuery.isLoading}
                disabled={
                  updatingId === order.id || order.status === "delivered"
                }
                onChange={(method) => paymentMutation.mutate({ order, method })}
              />
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
            title: "Logs",
            width: 72,
            align: "center",
            render: (_, order) => (
              <Tooltip title="Histórico de alterações">
                <Button
                  type="text"
                  aria-label={`Logs do pedido ${order.code}`}
                  icon={<HistoryOutlined />}
                  onClick={() => setLogsOrder(order)}
                />
              </Tooltip>
            ),
          },
          {
            title: "Ações",
            width: 76,
            align: "center",
            fixed: "right",
            render: (_, order) => {
              const next = nextStatus(order.status, order.fulfillment);
              const canEditOrder = order.status !== "delivered";
              const canCancel =
                order.status !== "cancelled" && order.status !== "delivered";
              return (
                <RowActions
                  disabled={order.status === "delivered"}
                  items={[
                    next
                      ? {
                          key: "next",
                          label: statusActionLabel(next),
                          disabled: updatingId === order.id,
                          onClick: () => changeStatus(order, next),
                        }
                      : null,
                    canEditOrder
                      ? {
                          key: "edit",
                          label: "Editar",
                          disabled: updatingId === order.id,
                          onClick: () => setEditOrder(order),
                        }
                      : null,
                    canCancel
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
      </FillTable>
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
              paymentMethods={paymentMethods}
              paymentMethodsLoading={paymentMethodsQuery.isLoading}
              onChangeStatus={changeStatus}
              onChangePayment={(target, method) =>
                paymentMutation.mutate({ order: target, method })
              }
              onEditItems={() => setEditOrder(order)}
              onOpenLogs={() => setLogsOrder(order)}
              onPreviewReceipt={setReceiptOrder}
            />
          ))}
        </MobileCardList>
      </div>
      <ReceiptPreviewModal
        order={receiptOrder}
        store={storeQuery.data}
        open={Boolean(receiptOrder)}
        onClose={() => setReceiptOrder(null)}
      />
      <OrderEditItemsModal
        order={editOrder}
        open={Boolean(editOrder)}
        submitting={itemsMutation.isPending}
        onCancel={() => {
          if (!itemsMutation.isPending) setEditOrder(null);
        }}
        onSave={(items) => {
          if (!editOrder) return;
          itemsMutation.mutate({
            order: editOrder,
            items: items.map((item) => ({
              id: item.id,
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              notes: item.notes,
            })),
          });
        }}
      />
      <OrderLogsModal
        order={logsOrder}
        open={Boolean(logsOrder)}
        onClose={() => setLogsOrder(null)}
      />
      <PrepTimeModal
        order={prepOrder}
        open={Boolean(prepOrder)}
        submitting={statusMutation.isPending && Boolean(prepOrder)}
        defaultMinutes={storeQuery.data?.defaultAcceptMinutes}
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
