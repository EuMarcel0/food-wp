import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Empty, Tag, Typography } from "antd";
import {
  CommentOutlined,
  RobotOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../auth/AuthProvider";
import { api } from "../../lib/api";
import {
  conversationStateLabel,
  formatDate,
  formatPhoneDisplay,
} from "../../lib/format";
import { displayName } from "../../lib/profile";
import { queryKeys } from "../../lib/queryKeys";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/cn";
import { entityCard, listPage } from "../../ui";
import type { LiveConversation } from "../../types";

export function ConversationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: queryKeys.conversations.live,
    queryFn: () => api.conversations(true),
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

  const items = listQuery.data ?? [];
  const humanCount = items.filter((item) => item.handoffMode === "human").length;

  return (
    <div className={listPage}>
      <PageHeader
        kicker="WhatsApp"
        title="Conversas"
        subtitle="Acompanhe atendimentos em andamento no bot. Assuma quando a cliente precisar de ajuda humana."
        extra={
          <div className="flex flex-wrap items-center gap-2 text-sm text-food-muted">
            <Tag icon={<CommentOutlined />}>{items.length} ativas</Tag>
            {humanCount ? (
              <Tag color="purple" icon={<UserSwitchOutlined />}>
                {humanCount} com atendente
              </Tag>
            ) : null}
          </div>
        }
      />

      <Alert
        type="info"
        showIcon
        className="mb-4"
        message="Como usar o Assumir"
        description="Ao assumir, o bot para de responder só aquele chat. Continue a conversa no WhatsApp Manager (Meta). Quando terminar, devolva ao bot."
      />

      {listQuery.isError ? (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          message="Não foi possível carregar as conversas"
          description={
            listQuery.error instanceof Error
              ? listQuery.error.message
              : "Tente de novo em instantes."
          }
        />
      ) : null}

      {!listQuery.isLoading && !items.length ? (
        <Empty
          className="rounded-2xl border border-food-border bg-food-surface py-16"
          description="Nenhuma conversa nas últimas 24h."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <ConversationCard
              key={item.id}
              item={item}
              busy={
                (takeoverMutation.isPending &&
                  takeoverMutation.variables === item.id) ||
                (releaseMutation.isPending && releaseMutation.variables === item.id)
              }
              onTakeover={() => takeoverMutation.mutate(item.id)}
              onRelease={() => releaseMutation.mutate(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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

  return (
    <article
      className={cn(
        entityCard,
        human ? "before:bg-purple-500" : "before:bg-food-accent",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Typography.Title level={5} className="!mb-0.5 !mt-0 truncate">
            {name}
          </Typography.Title>
          <p className="m-0 text-sm text-food-muted tabular-nums">{phone}</p>
        </div>
        <Tag
          color={human ? "purple" : "default"}
          icon={human ? <UserSwitchOutlined /> : <RobotOutlined />}
        >
          {human ? "Atendente" : "Bot"}
        </Tag>
      </div>

      <dl className="m-0 grid gap-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-food-muted">Etapa</dt>
          <dd className="m-0 font-semibold text-right">
            {conversationStateLabel(item.state)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-food-muted">Carrinho</dt>
          <dd className="m-0 font-semibold tabular-nums">
            {item.cartItemCount
              ? `${item.cartItemCount} item${item.cartItemCount > 1 ? "s" : ""}`
              : "Vazio"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-food-muted">Última msg</dt>
          <dd className="m-0 font-semibold tabular-nums">
            {formatDate(item.lastMessageAt)}
          </dd>
        </div>
        {human && item.handoffBy ? (
          <div className="flex justify-between gap-3">
            <dt className="text-food-muted">Assumido por</dt>
            <dd className="m-0 font-semibold truncate">{item.handoffBy}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {human ? (
          <Button
            type="primary"
            icon={<RobotOutlined />}
            loading={busy}
            onClick={onRelease}
          >
            Devolver ao bot
          </Button>
        ) : (
          <Button
            type="primary"
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
