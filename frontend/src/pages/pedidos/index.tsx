import { useCallback, useEffect, useRef, useState } from "react";
import { Input, Select, Table, Tag } from "antd";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { OrderCard } from "./OrderCard";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/hooks";
import {
  PAGE_SIZE,
  clampPage,
  serverPagination,
} from "../../lib/pagination";
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [updating, setUpdating] = useState<string | null>(null);
  const [qInput, setQInput] = useState("");
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [fulfillment, setFulfillment] = useState<
    Order["fulfillment"] | undefined
  >();
  const q = useDebouncedValue(qInput.trim(), 300);
  const filters = { q: q || undefined, status, fulfillment };
  const activeCount = [q, status, fulfillment].filter(Boolean).length;
  const filterKey = `${q}|${status ?? ""}|${fulfillment ?? ""}`;
  const filterKeyRef = useRef(filterKey);
  const pageRef = useRef({ page, limit, filters });
  pageRef.current = { page, limit, filters };

  const load = useCallback(async (silent = false) => {
    const {
      page: currentPage,
      limit: currentLimit,
      filters: currentFilters,
    } = pageRef.current;
    const result = await api.orders(
      currentPage,
      currentLimit,
      silent,
      currentFilters,
    );
    const nextPage = clampPage(currentPage, currentLimit, result.total);
    setOrders(result.items);
    setTotal(result.total);
    if (nextPage !== currentPage) setPage(nextPage);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (filterKeyRef.current !== filterKey) {
      filterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    setLoading(true);
    load().catch(() => {
      setOrders([]);
      setTotal(0);
      setLoading(false);
    });
  }, [page, limit, filterKey, load]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      const timer = window.setInterval(() => {
        load(true).catch(() => undefined);
      }, 8000);
      return () => window.clearInterval(timer);
    }

    const channel = client
      .channel("orders-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          load(true).catch(() => undefined);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [load]);

  async function changeStatus(order: Order, status: OrderStatus) {
    setUpdating(order.id);
    try {
      const updated = await api.updateOrderStatus(
        order.id,
        status,
        displayName(user),
      );
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success(`Pedido #${updated.code} → ${STATUS_LABEL[updated.status]}`);
    } catch {
      // o toast de erro já vem da API
    } finally {
      setUpdating(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Pedidos"
        subtitle="Ao mudar o status, o backend avisa o cliente no WhatsApp automaticamente."
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
          placeholder="Código, cliente ou item"
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
        loading={loading}
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
                          disabled: updating === order.id,
                          onClick: () => changeStatus(order, next),
                        }
                      : null,
                    order.status !== "cancelled" && order.status !== "delivered"
                      ? {
                          key: "cancel",
                          label: "Cancelar",
                          danger: true,
                          disabled: updating === order.id,
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
          loading={loading}
          isEmpty={orders.length === 0}
          empty={
            activeCount > 0
              ? "Nenhum pedido encontrado com esses filtros."
              : "Nenhum pedido nesta página."
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
              updating={updating === order.id}
              onChangeStatus={changeStatus}
            />
          ))}
        </MobileCardList>
      </div>
    </>
  );
}
