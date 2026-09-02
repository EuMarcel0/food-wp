import { useEffect, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Empty, Table, Tabs, Tag } from "antd";
import { CommentOutlined } from "@ant-design/icons";
import { FillTable } from "../../components/FillTable";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { useDialog } from "../../dialog";
import { useAuth } from "../../auth/AuthProvider";
import { api } from "../../lib/api";
import {
  STATUS_COLOR,
  STATUS_LABEL,
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
import { WhatsAppInbox } from "./WhatsAppInbox";

type TabKey = "active" | "history";

export function ConversationsPage() {
  const dialog = useDialog();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const [tab, setTab] = useState<TabKey>("active");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const listMode = tab === "history" && isDesktop;
  const { shellRef, tableAreaRef, bodyHeight } = useTableGridHeight(
    listMode,
    tab,
  );

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
        { event: "*", schema: "public", table: "conversation_messages" },
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
      toast.success("Atendimento assumido. Responda pelo chat ao lado.");
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

  const closeMutation = useMutation({
    mutationFn: (id: string) => api.closeConversation(id),
    onSuccess: async () => {
      toast.success("Atendimento encerrado.");
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
          O bot vai parar de responder <strong>{name}</strong>. Você continua
          pelo chat desta tela. Deseja assumir?
        </>
      ),
      okText: "Assumir",
      cancelText: "Cancelar",
      onConfirm: async () => {
        await takeoverMutation.mutateAsync(item.id);
      },
    });
  }

  function askClose(item: LiveConversation) {
    const name = item.customerName?.trim() || "este cliente";
    void dialog.confirm({
      title: "Encerrar atendimento",
      description: (
        <>
          A conversa com <strong>{name}</strong> será finalizada. O cliente recebe
          uma despedida no WhatsApp e some das conversas ativas — o bot só retoma
          quando ele mandar nova mensagem.
        </>
      ),
      okText: "Encerrar",
      cancelText: "Cancelar",
      okButtonProps: { danger: true },
      onConfirm: async () => {
        await closeMutation.mutateAsync(item.id);
      },
    });
  }

  const activeItems = activeQuery.data ?? [];
  const historyItems = historyQuery.data ?? [];
  const humanCount = activeItems.filter((item) => item.handoffMode === "human").length;
  const pagedHistory = historyItems.slice((page - 1) * limit, page * limit);

  return (
    <div className={cn(listPage, "min-h-0")}>
      <PageHeader
        className="mb-3 shrink-0"
        kicker="WhatsApp"
        title="Conversas"
        subtitle="Inbox do WhatsApp: atenda no chat, ou veja o histórico de pedidos."
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
                WhatsApp
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
          items={isDesktop ? pagedHistory : historyItems}
          allCount={historyItems.length}
          error={historyQuery.error}
          loading={historyQuery.isLoading}
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
        <WhatsAppInbox
          items={activeItems}
          error={activeQuery.error}
          loading={activeQuery.isLoading}
          busyId={
            takeoverMutation.isPending
              ? takeoverMutation.variables
              : releaseMutation.isPending
                ? releaseMutation.variables
                : closeMutation.isPending
                  ? closeMutation.variables
                  : null
          }
          onTakeover={askTakeover}
          onRelease={(item) => releaseMutation.mutate(item.id)}
          onClose={askClose}
        />
      )}
    </div>
  );
}

function HistoryPane({
  items,
  allCount,
  error,
  loading,
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

      <div className={cn(listCards, isDesktop && "hidden")}>
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
        <Tag
          className="m-0 shrink-0 text-[11px] leading-none"
          color={STATUS_COLOR[item.orderStatus]}
        >
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
