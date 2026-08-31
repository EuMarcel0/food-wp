import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button, DatePicker, Input, Select, Table, Tag, Tooltip } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { OrderCard } from "./OrderCard";
import { OrderItemsLeaders } from "./OrderItemsLeaders";
import { PrepTimeModal } from "./PrepTimeModal";
import { ReceiptPreviewModal } from "./ReceiptPreviewModal";
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
  cashChangeLabel,
} from "../../lib/format";
import { useAuth } from "../../auth/AuthProvider";
import { displayName } from "../../lib/profile";
import type { Order, OrderStatus } from "../../types";
import { FillTable } from "../../components/FillTable";
import { useTableGridHeight } from "../../lib/useTableGridHeight";
import { filterSearch, filterSelect, listCards, listPage, tableClass, tableGridFill } from "../../ui";

const STATUS_OPTIONS = (
  Object.entries(STATUS_LABEL) as [OrderStatus, string][]
).map(([value, label]) => ({ value, label }));

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
  >(null);
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
            render: (value: Order["paymentMethod"], order) =>
              value ? (
                <span className="inline-flex flex-col items-center gap-0.5">
                  <Tag color={PAYMENT_COLOR[value]}>{PAYMENT_LABEL[value]}</Tag>
                  {value === "cash" && order.changeForCents != null ? (
                    <span className="max-w-[11.5rem] whitespace-normal text-[11px] font-medium leading-tight text-food-muted">
                      {cashChangeLabel(order.changeForCents, order.totalCents)}
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
              onChangeStatus={changeStatus}
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
      <PrepTimeModal
        order={prepOrder}
        open={Boolean(prepOrder)}
        submitting={statusMutation.isPending && Boolean(prepOrder)}
        defaultMinutes={storeQuery.data?.defaultPrepMinutes}
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
