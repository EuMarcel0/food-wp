import { useEffect, useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Tag, Tabs } from "antd";
import { CommentOutlined } from "@ant-design/icons";
import { PageHeader } from "../../components/PageHeader";
import { useDialog } from "../../dialog";
import { useAuth } from "../../auth/AuthProvider";
import { api } from "../../lib/api";
import { useMediaQuery } from "../../lib/hooks";
import { displayName } from "../../lib/profile";
import { queryKeys } from "../../lib/queryKeys";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/cn";
import { listPage } from "../../ui";
import type { LiveConversation } from "../../types";
import { WhatsAppInbox } from "./WhatsAppInbox";

type TabKey = "active" | "history";

const HISTORY_FIRST_PAGE = 30;
const HISTORY_PAGE_SIZE = 15;

export function ConversationsPage() {
  const dialog = useDialog();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const [tab, setTab] = useState<TabKey>("active");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const activeQuery = useQuery({
    queryKey: queryKeys.conversations.live,
    queryFn: () => api.conversations("active", true),
    refetchInterval: supabase ? false : 8000,
    networkMode: "always",
  });

  const historyQuery = useInfiniteQuery({
    queryKey: queryKeys.conversations.history,
    queryFn: ({ pageParam }) =>
      api.conversationHistory(true, {
        limit: pageParam === 0 ? HISTORY_FIRST_PAGE : HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextOffset != null
        ? lastPage.nextOffset
        : undefined,
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
      okDanger: true,
      onConfirm: async () => {
        await closeMutation.mutateAsync(item.id);
      },
    });
  }

  const activeItems = activeQuery.data ?? [];
  const historyItems = useMemo(() => {
    const seen = new Set<string>();
    const items: LiveConversation[] = [];
    for (const page of historyQuery.data?.pages ?? []) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }
    return items;
  }, [historyQuery.data]);
  const historyTotal =
    historyQuery.data?.pages[0]?.total ?? historyItems.length;
  const humanCount = activeItems.filter((item) => item.handoffMode === "human").length;

  return (
    <div
      className={cn(
        listPage,
        "min-h-0",
        !isDesktop &&
          "h-full max-lg:h-full max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-hidden",
      )}
    >
      <PageHeader
        className={cn(
          "mb-3 shrink-0 max-lg:hidden max-[1440px]:hidden",
          "[@media(max-height:800px)]:mb-1.5 [@media(max-height:800px)]:[&_.ant-typography-secondary]:hidden",
        )}
        kicker="WhatsApp"
        title="Conversas"
        subtitle="Inbox do WhatsApp: atenda no chat, ou veja o histórico de pedidos."
      />

      <div
        className={cn(
          "shrink-0",
          !isDesktop && mobileChatOpen && "max-lg:hidden",
          !isDesktop && !mobileChatOpen && "max-lg:px-3 max-lg:pt-2",
          isDesktop && "max-[1440px]:px-3 max-[1440px]:pt-2",
        )}
      >
        <Tabs
          activeKey={tab}
          onChange={(key) => {
            setTab(key as TabKey);
            setMobileChatOpen(false);
          }}
          className={cn(
            "mb-0 [&_.ant-tabs-nav]:mb-3 [&_.ant-tabs-content-holder]:hidden",
            "[@media(max-height:800px)]:[&_.ant-tabs-nav]:mb-2",
            !isDesktop &&
              !mobileChatOpen &&
              "max-lg:[&_.ant-tabs-nav]:mb-2 max-lg:[&_.ant-tabs-tab]:!ms-0 max-lg:[&_.ant-tabs-tab+.ant-tabs-tab]:!ms-5",
          )}
          items={[
            {
              key: "active",
              label: (
                <span className="inline-flex max-w-full items-center gap-1.5">
                  WhatsApp
                  <Tag className="!m-0" icon={<CommentOutlined />}>
                    {activeItems.length}
                  </Tag>
                  {humanCount ? (
                    <Tag className="!m-0 max-lg:hidden" color="purple">
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
                  <Tag className="!m-0">{historyTotal}</Tag>
                </span>
              ),
            },
          ]}
        />
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          !isDesktop && "max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-hidden",
          isDesktop && "max-[1440px]:min-h-0",
        )}
      >
        {tab === "history" ? (
          <WhatsAppInbox
            key="history"
            items={historyItems}
            error={historyQuery.error}
            loading={historyQuery.isLoading}
            readOnly
            listTotal={historyTotal}
            hasMore={Boolean(historyQuery.hasNextPage)}
            loadingMore={historyQuery.isFetchingNextPage}
            onLoadMore={() => {
              if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
                void historyQuery.fetchNextPage();
              }
            }}
            onMobileChatOpenChange={setMobileChatOpen}
          />
        ) : (
          <WhatsAppInbox
            key="active"
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
            onMobileChatOpenChange={setMobileChatOpen}
          />
        )}
      </div>
    </div>
  );
}
