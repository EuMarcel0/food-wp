import { useEffect, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Button, Empty, Segmented, Table, Tabs, Tag } from "antd";
import {
  AppstoreOutlined,
  CommentOutlined,
  RobotOutlined,
  UnorderedListOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import { FillTable } from "../../components/FillTable";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { useDialog } from "../../dialog";
import { useAuth } from "../../auth/AuthProvider";
import { api } from "../../lib/api";
import {
  STATUS_COLOR,
  STATUS_LABEL,
  conversationStateLabel,
  formatBRL,
  formatDate,
  formatPhoneDisplay,
} from "../../lib/format";
import { useMediaQuery } from "../../lib/hooks";
import { displayName, generatedAvatar } from "../../lib/profile";
import { queryKeys } from "../../lib/queryKeys";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import { PAGE_SIZE, serverPagination } from "../../lib/pagination";
import { useTableGridHeight } from "../../lib/useTableGridHeight";
import { cn } from "../../lib/cn";
import { listCards, listPage, tableClass, tableGridFill } from "../../ui";
import type { ConversationHistoryItem, LiveConversation } from "../../types";

const VIEW_STORAGE_KEY = "food-wp-conversations-view";

type ViewMode = "grid" | "list";
type TabKey = "active" | "history";

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function ConversationsPage() {
  const dialog = useDialog();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const [tab, setTab] = useState<TabKey>("active");
  const [view, setView] = useState<ViewMode>(readViewMode);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const listMode = view === "list" && isDesktop;
  const { shellRef, tableAreaRef, bodyHeight } = useTableGridHeight(
    listMode,
    `${tab}-${view}`,
  );

  function changeView(next: ViewMode) {
    setView(next);
    setPage(1);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // storage bloqueado
    }
  }

  useEffect(() => {
    setPage(1);
  }, [tab]);

  const activeQuery = useQuery({
    queryKey: queryKeys.conversations.live,
    queryFn: () => api.conversations("active", true),
    refetchInterval: supabase ? false : 8000,
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.conversations.history,
    queryFn: () => api.conversationHistory(true),
    refetchInterval: supabase ? false : 8000,
  });

  useEffect(() => {
    async function refresh() {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    }

    const client = supabase;
    if (!client) {
      const timer = window.setInterval(() => {
        void refresh();
      }, 8000);
      return () => window.clearInterval(timer);
    }

    const channel = client
      .channel("conversations-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          void refresh();
        },
      )
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

  const takeoverMutation = useMutation({
    mutationFn: (id: string) =>
      api.takeoverConversation(id, displayName(user) || undefined),
    onSuccess: async () => {
      toast.success("Atendimento assumido. Responda pelo WhatsApp Manager.");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (id: string) => api.releaseConversation(id),
    onSuccess: async () => {
      toast.success("Conversa devolvida ao bot.");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all,
      });
    },
  });

  function askTakeover(item: LiveConversation) {
    const name = item.customerName?.trim() || "este cliente";
    void dialog.confirm({
      title: "Assumir atendimento",
      description: (
        <>
          O bot vai parar de responder <strong>{name}</strong>. Continue a
          conversa no WhatsApp Manager. Deseja assumir?
        </>
      ),
      okText: "Assumir",
      cancelText: "Cancelar",
      onConfirm: async () => {
        await takeoverMutation.mutateAsync(item.id);
      },
    });
  }

  const activeItems = activeQuery.data ?? [];
  const historyItems = historyQuery.data ?? [];
  const humanCount = activeItems.filter((item) => item.handoffMode === "human").length;
  const pagedActive = activeItems.slice((page - 1) * limit, page * limit);
  const pagedHistory = historyItems.slice((page - 1) * limit, page * limit);

  return (
    <div className={cn(listPage, "min-h-0")}>
      <PageHeader
        className="mb-3 shrink-0"
        kicker="WhatsApp"
        title="Conversas"
        subtitle="Atendimentos em andamento no bot e histórico dos que viraram pedido."
        extra={
          <Segmented
            value={view}
            onChange={(value) => changeView(value as ViewMode)}
            options={[
              {
                value: "grid",
                icon: <AppstoreOutlined />,
                label: "Cards",
              },
              {
                value: "list",
                icon: <UnorderedListOutlined />,
                label: "Lista",
              },
            ]}
          />
        }
      />

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as TabKey)}
        className="mb-0 shrink-0 [&_.ant-tabs-nav]:mb-3 [&_.ant-tabs-content-holder]:hidden"
        items={[
          {
            key: "active",
            label: (
              <span className="inline-flex items-center gap-1.5">
                Ativas
                <Tag className="!m-0" icon={<CommentOutlined />}>
                  {activeItems.length}
                </Tag>
                {humanCount ? (
                  <Tag className="!m-0" color="purple">
                    {humanCount} humano
                  </Tag>
                ) : null}
              </span>
            ),
          },
          {
            key: "history",
            label: (
              <span className="inline-flex items-center gap-1.5">
                Histórico
                <Tag className="!m-0">{historyItems.length}</Tag>
              </span>
            ),
          },
        ]}
      />

      {tab === "history" ? (
        <HistoryPane
          items={view === "list" ? pagedHistory : historyItems}
          allCount={historyItems.length}
          error={historyQuery.error}
          loading={historyQuery.isLoading}
          view={view}
          isDesktop={isDesktop}
          listMode={listMode}
          shellRef={shellRef}
          tableAreaRef={tableAreaRef}
          bodyHeight={bodyHeight}
          page={page}
          limit={limit}
          onPageChange={(nextPage, nextSize) => {
            setPage(nextPage);
            setLimit(nextSize);
          }}
        />
      ) : (
        <ActivePane
          items={view === "list" ? pagedActive : activeItems}
          allCount={activeItems.length}
          error={activeQuery.error}
          loading={activeQuery.isLoading}
          view={view}
          isDesktop={isDesktop}
          listMode={listMode}
          shellRef={shellRef}
          tableAreaRef={tableAreaRef}
          bodyHeight={bodyHeight}
          page={page}
          limit={limit}
          onPageChange={(nextPage, nextSize) => {
            setPage(nextPage);
            setLimit(nextSize);
          }}
          busyId={
            takeoverMutation.isPending
              ? takeoverMutation.variables
              : releaseMutation.isPending
                ? releaseMutation.variables
                : null
          }
          onTakeover={askTakeover}
          onRelease={(item) => releaseMutation.mutate(item.id)}
        />
      )}
    </div>
  );
}

function ActivePane({
  items,
  allCount,
  error,
  loading,
  view,
  isDesktop,
  listMode,
  shellRef,
  tableAreaRef,
  bodyHeight,
  page,
  limit,
  onPageChange,
  busyId,
  onTakeover,
  onRelease,
}: {
  items: LiveConversation[];
  allCount: number;
  error: unknown;
  loading: boolean;
  view: ViewMode;
  isDesktop: boolean;
  listMode: boolean;
  shellRef: RefObject<HTMLDivElement | null>;
  tableAreaRef: RefObject<HTMLDivElement | null>;
  bodyHeight: number;
  page: number;
  limit: number;
  onPageChange: (page: number, pageSize: number) => void;
  busyId: string | null | undefined;
  onTakeover: (item: LiveConversation) => void;
  onRelease: (item: LiveConversation) => void;
}) {
  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Não foi possível carregar as conversas ativas"
        description={
          error instanceof Error ? error.message : "Tente de novo em instantes."
        }
      />
    );
  }

  if (!loading && allCount === 0) {
    return (
      <Empty
        className="rounded-2xl border border-food-border bg-food-surface py-16"
        description="Nenhuma conversa ativa nas últimas 24h."
      />
    );
  }

  if (view === "grid") {
    return (
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <ConversationCard
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onTakeover={() => onTakeover(item)}
            onRelease={() => onRelease(item)}
          />
        ))}
      </div>
    );
  }

  const pagination = serverPagination(page, limit, allCount, onPageChange);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {listMode ? (
        <FillTable
          shellRef={shellRef}
          tableAreaRef={tableAreaRef}
          pagination={pagination}
        >
          <Table<LiveConversation>
            rowKey="id"
            loading={loading}
            dataSource={items}
            pagination={false}
            scroll={{ x: 720, y: bodyHeight }}
            className={`${tableClass} ${tableGridFill}`}
            columns={[
            {
              title: "Cliente",
              key: "customer",
              render: (_, item) => (
                <CustomerIdentity
                  name={item.customerName?.trim() || "Cliente"}
                  phone={formatPhoneDisplay(item.customerPhone)}
                  avatarUrl={item.customerAvatarUrl}
                  seed={item.customerId}
                />
              ),
            },
            {
              title: "Etapa",
              dataIndex: "state",
              render: (state: string) => conversationStateLabel(state),
            },
            {
              title: "Carrinho",
              dataIndex: "cartItemCount",
              width: 100,
              render: (count: number) =>
                count ? `${count} item${count > 1 ? "s" : ""}` : "Vazio",
            },
            {
              title: "Modo",
              dataIndex: "handoffMode",
              width: 120,
              render: (mode: LiveConversation["handoffMode"]) =>
                mode === "human" ? (
                  <Tag color="purple" icon={<UserSwitchOutlined />}>
                    Atendente
                  </Tag>
                ) : (
                  <Tag icon={<RobotOutlined />}>Bot</Tag>
                ),
            },
            {
              title: "Última msg",
              dataIndex: "lastMessageAt",
              width: 160,
              render: (value: string) => formatDate(value),
            },
            {
              title: "Ações",
              key: "actions",
              width: 72,
              align: "center",
              render: (_, item) => (
                <RowActions
                  items={
                    item.handoffMode === "human"
                      ? [
                          {
                            key: "release",
                            label: "Devolver ao bot",
                            icon: <RobotOutlined />,
                            onClick: () => onRelease(item),
                          },
                        ]
                      : [
                          {
                            key: "takeover",
                            label: "Assumir",
                            icon: <UserSwitchOutlined />,
                            onClick: () => onTakeover(item),
                          },
                        ]
                  }
                />
              ),
            },
          ]}
        />
      </FillTable>
      ) : null}

      <div className={cn(listCards, isDesktop && view === "list" && "hidden")}>
        <MobileCardList
          loading={loading}
          isEmpty={allCount === 0}
          empty="Nenhuma conversa ativa nas últimas 24h."
          pagination={pagination}
        >
          {items.map((item) => (
            <ConversationCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onTakeover={() => onTakeover(item)}
              onRelease={() => onRelease(item)}
            />
          ))}
        </MobileCardList>
      </div>
    </div>
  );
}

function HistoryPane({
  items,
  allCount,
  error,
  loading,
  view,
  isDesktop,
  listMode,
  shellRef,
  tableAreaRef,
  bodyHeight,
  page,
  limit,
  onPageChange,
}: {
  items: ConversationHistoryItem[];
  allCount: number;
  error: unknown;
  loading: boolean;
  view: ViewMode;
  isDesktop: boolean;
  listMode: boolean;
  shellRef: RefObject<HTMLDivElement | null>;
  tableAreaRef: RefObject<HTMLDivElement | null>;
  bodyHeight: number;
  page: number;
  limit: number;
  onPageChange: (page: number, pageSize: number) => void;
}) {
  if (error) {
    return (
      <Alert
        type="error"
        showIcon
        message="Não foi possível carregar o histórico"
        description={
          error instanceof Error ? error.message : "Tente de novo em instantes."
        }
      />
    );
  }

  if (!loading && allCount === 0) {
    return (
      <Empty
        className="rounded-2xl border border-food-border bg-food-surface py-16"
        description="Ainda não há pedidos vindos do WhatsApp."
      />
    );
  }

  if (view === "grid") {
    return (
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <HistoryCard key={item.id} item={item} />
        ))}
      </div>
    );
  }

  const pagination = serverPagination(page, limit, allCount, onPageChange);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {listMode ? (
        <FillTable
          shellRef={shellRef}
          tableAreaRef={tableAreaRef}
          pagination={pagination}
        >
          <Table<ConversationHistoryItem>
            rowKey="id"
            loading={loading}
            dataSource={items}
            pagination={false}
            scroll={{ x: 720, y: bodyHeight }}
            className={`${tableClass} ${tableGridFill}`}
            columns={[
              {
                title: "Pedido",
                dataIndex: "orderCode",
                width: 110,
                render: (code: string) => (
                  <span className="font-bold">#{code}</span>
                ),
              },
            {
              title: "Cliente",
              key: "customer",
              render: (_, item) => (
                <CustomerIdentity
                  name={item.customerName?.trim() || "Cliente"}
                  phone={formatPhoneDisplay(item.customerPhone)}
                  avatarUrl={item.customerAvatarUrl}
                  seed={item.customerId}
                />
              ),
            },
            {
              title: "Status",
              dataIndex: "orderStatus",
              width: 140,
              render: (status: ConversationHistoryItem["orderStatus"]) => (
                <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>
              ),
            },
              {
                title: "Total",
                dataIndex: "totalCents",
                width: 120,
                render: (cents: number) => (
                  <span className="font-semibold tabular-nums">
                    {formatBRL(cents)}
                  </span>
                ),
              },
              {
                title: "Quando",
                dataIndex: "closedAt",
                width: 160,
                render: (value: string) => formatDate(value),
              },
            ]}
          />
        </FillTable>
      ) : null}

      <div className={cn(listCards, isDesktop && view === "list" && "hidden")}>
        <MobileCardList
          loading={loading}
          isEmpty={allCount === 0}
          empty="Ainda não há pedidos vindos do WhatsApp."
          pagination={pagination}
        >
          {items.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
        </MobileCardList>
      </div>
    </div>
  );
}

function customerAvatarSrc(item: {
  customerAvatarUrl?: string | null;
  customerName?: string | null;
  customerPhone?: string;
  customerId?: string;
}) {
  if (item.customerAvatarUrl?.trim()) return item.customerAvatarUrl.trim();
  return generatedAvatar(
    item.customerPhone || item.customerName || item.customerId || "cliente",
  );
}

function CustomerIdentity({
  name,
  phone,
  avatarUrl,
  seed,
  size = 40,
}: {
  name: string;
  phone: string;
  avatarUrl?: string | null;
  seed: string;
  size?: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar
        size={size}
        src={customerAvatarSrc({
          customerAvatarUrl: avatarUrl,
          customerName: name,
          customerPhone: phone,
          customerId: seed,
        })}
        alt=""
        className="shrink-0 border border-food-border bg-food-chip"
      />
      <div className="min-w-0">
        <p className="m-0 truncate text-[13px] font-semibold leading-tight text-food-text">
          {name}
        </p>
        <p className="m-0 truncate text-xs leading-tight text-food-muted tabular-nums">
          {phone}
        </p>
      </div>
    </div>
  );
}

const compactCard =
  "relative overflow-hidden rounded-2xl border border-food-border bg-food-card px-3 py-2.5 shadow-food-soft before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:content-['']";

function ConversationCard({
  item,
  busy,
  onTakeover,
  onRelease,
}: {
  item: LiveConversation;
  busy: boolean;
  onTakeover: () => void;
  onRelease: () => void;
}) {
  const human = item.handoffMode === "human";
  const name = item.customerName?.trim() || "Cliente";
  const phone = formatPhoneDisplay(item.customerPhone);
  const cart =
    item.cartItemCount > 0
      ? `${item.cartItemCount} item${item.cartItemCount > 1 ? "s" : ""}`
      : "Carrinho vazio";

  return (
    <article
      className={cn(
        compactCard,
        human ? "before:bg-purple-500" : "before:bg-food-accent",
      )}
    >
      <div className="flex items-start justify-between gap-2 pl-1">
        <CustomerIdentity
          name={name}
          phone={phone}
          avatarUrl={item.customerAvatarUrl}
          seed={item.customerId}
          size={34}
        />
        <Tag
          className="m-0 shrink-0 text-[11px] leading-none"
          color={human ? "purple" : "default"}
          icon={human ? <UserSwitchOutlined /> : <RobotOutlined />}
        >
          {human ? "Humano" : "Bot"}
        </Tag>
      </div>

      <p className="mb-0 mt-2 pl-1 text-xs leading-snug text-food-muted">
        <span className="font-medium text-food-text">
          {conversationStateLabel(item.state)}
        </span>
        <span className="mx-1.5 text-food-border">·</span>
        <span>{cart}</span>
        <span className="mx-1.5 text-food-border">·</span>
        <span className="tabular-nums">{formatDate(item.lastMessageAt)}</span>
      </p>

      {human && item.handoffBy ? (
        <p className="mb-0 mt-1 pl-1 text-[11px] text-food-muted">
          Assumido por {item.handoffBy}
        </p>
      ) : null}

      <div className="mt-2.5 pl-1">
        {human ? (
          <Button
            size="small"
            type="primary"
            className="w-full"
            icon={<RobotOutlined />}
            loading={busy}
            onClick={onRelease}
          >
            Devolver ao bot
          </Button>
        ) : (
          <Button
            size="small"
            type="primary"
            className="w-full"
            icon={<UserSwitchOutlined />}
            loading={busy}
            onClick={onTakeover}
          >
            Assumir
          </Button>
        )}
      </div>
    </article>
  );
}

function HistoryCard({ item }: { item: ConversationHistoryItem }) {
  const name = item.customerName?.trim() || "Cliente";
  const phone = formatPhoneDisplay(item.customerPhone);
  return (
    <article className={cn(compactCard, "before:bg-zinc-400")}>
      <div className="flex items-start justify-between gap-2 pl-1">
        <div className="min-w-0">
          <p className="m-0 mb-1.5 text-[13px] font-bold leading-tight text-food-text">
            Pedido #{item.orderCode}
          </p>
          <CustomerIdentity
            name={name}
            phone={phone}
            avatarUrl={item.customerAvatarUrl}
            seed={item.customerId}
            size={34}
          />
        </div>
        <Tag className="m-0 shrink-0 text-[11px] leading-none" color={STATUS_COLOR[item.orderStatus]}>
          {STATUS_LABEL[item.orderStatus]}
        </Tag>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pl-1">
        <span className="text-xs text-food-muted tabular-nums">
          {formatDate(item.closedAt)}
        </span>
        <span className="text-sm font-extrabold tabular-nums text-food-accent">
          {formatBRL(item.totalCents)}
        </span>
      </div>
    </article>
  );
}
