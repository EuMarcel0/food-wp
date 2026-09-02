import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Button, Empty, Input, Spin, Tag } from "antd";
import {
  ArrowLeftOutlined,
  CheckOutlined,
  RobotOutlined,
  SendOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../auth/AuthProvider";
import { api } from "../../lib/api";
import { conversationStateLabel, formatPhoneDisplay } from "../../lib/format";
import { useMediaQuery } from "../../lib/hooks";
import { displayName, generatedAvatar } from "../../lib/profile";
import { queryKeys } from "../../lib/queryKeys";
import { supabase } from "../../lib/supabase";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/cn";
import type { ConversationMessage, LiveConversation } from "../../types";

function relativeTime(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function clock(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function customerLabel(item: LiveConversation) {
  return item.customerName?.trim() || formatPhoneDisplay(item.customerPhone) || "Cliente";
}

export function WhatsAppInbox({
  items,
  loading,
  error,
  busyId,
  onTakeover,
  onRelease,
}: {
  items: LiveConversation[];
  loading: boolean;
  error: unknown;
  busyId: string | null;
  onTakeover: (item: LiveConversation) => void;
  onRelease: (item: LiveConversation) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = (item.customerName ?? "").toLowerCase();
      const phone = item.customerPhone.replace(/\D/g, "");
      return name.includes(q) || phone.includes(q.replace(/\D/g, "")) || item.id.includes(q);
    });
  }, [items, query]);

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  useEffect(() => {
    if (!selectedId && filtered[0] && isDesktop) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId, isDesktop]);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const messagesQuery = useQuery({
    queryKey: queryKeys.conversations.messages(selectedId ?? ""),
    queryFn: () => api.conversationMessages(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: supabase ? false : 4000,
  });

  useEffect(() => {
    const client = supabase;
    if (!client || !selectedId) return;
    const channel = client
      .channel(`conversation-messages-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.messages(selectedId),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.live,
          });
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [queryClient, selectedId]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messagesQuery.data, selectedId]);

  const sendMutation = useMutation({
    mutationFn: ({
      conversationId,
      text,
      tempId,
    }: {
      conversationId: string;
      text: string;
      tempId: string;
    }) =>
      api
        .sendConversationMessage(
          conversationId,
          text,
          displayName(user) || undefined,
        )
        .then((result) => ({ ...result, tempId, conversationId })),
    onMutate: async ({ conversationId, text, tempId }) => {
      const key = queryKeys.conversations.messages(conversationId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ConversationMessage[]>(key);

      const optimistic: ConversationMessage = {
        id: tempId,
        conversationId,
        customerId: selected?.customerId ?? "",
        direction: "outbound",
        author: "agent",
        body: text,
        msgType: "text",
        createdAt: new Date().toISOString(),
      };

      queryClient.setQueryData<ConversationMessage[]>(key, (current) => [
        ...(current ?? []),
        optimistic,
      ]);

      queryClient.setQueryData<LiveConversation[]>(
        queryKeys.conversations.live,
        (current) =>
          (current ?? []).map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  handoffMode: "human" as const,
                  handoffBy: displayName(user) || item.handoffBy,
                  lastMessageAt: optimistic.createdAt,
                  lastMessagePreview: text.slice(0, 160),
                }
              : item,
          ),
      );

      return { previous, key };
    },
    onSuccess: async (result) => {
      const key = queryKeys.conversations.messages(result.conversationId);
      if (result.message) {
        queryClient.setQueryData<ConversationMessage[]>(key, (current) => {
          const list = current ?? [];
          const withoutTemp = list.filter((item) => item.id !== result.tempId);
          if (withoutTemp.some((item) => item.id === result.message!.id)) {
            return withoutTemp;
          }
          return [...withoutTemp, result.message!];
        });
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.live,
      });
    },
    onError: (err, variables, context) => {
      if (context?.previous && context.key) {
        queryClient.setQueryData(context.key, context.previous);
      }
      toast.error(err instanceof Error ? err.message : "Falha ao enviar.");
    },
  });

  function submitMessage() {
    const text = draft.trim();
    if (!text || !selectedId) return;
    const conversationId = selectedId;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDraft("");
    sendMutation.mutate({ conversationId, text, tempId });
  }

  return (
    <div className="grid min-h-[70vh] flex-1 overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside
        className={cn(
          "min-h-0 flex-col border-food-border bg-food-card lg:flex lg:border-r",
          selectedId ? "hidden lg:flex" : "flex",
        )}
      >
        <div className="shrink-0 space-y-2 border-b border-food-border p-3">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm text-food-text">WhatsApp</strong>
            <Tag className="!m-0" color="success">
              {items.length} ativas
            </Tag>
          </div>
          <Input.Search
            allowClear
            placeholder="Buscar nome ou telefone"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <Alert
              type="error"
              showIcon
              className="m-3"
              message={error instanceof Error ? error.message : "Falha ao carregar."}
            />
          ) : null}
          {loading && !items.length ? (
            <div className="flex justify-center py-10">
              <Spin />
            </div>
          ) : null}
          {!loading && !filtered.length ? (
            <Empty className="py-10" description="Nenhuma conversa ativa" />
          ) : null}
          {filtered.map((item) => {
            const active = item.id === selectedId;
            const human = item.handoffMode === "human";
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-0 border-b border-l-2 border-solid border-b-black/[0.06] px-3 py-3 text-left transition dark:border-b-white/[0.08]",
                  active
                    ? "border-l-food-accent bg-transparent bg-gradient-to-r from-food-accent/12 via-food-accent/[0.04] to-transparent dark:from-food-accent/[0.04] dark:via-food-accent/[0.015] dark:to-transparent"
                    : "border-l-transparent bg-transparent hover:bg-black/[0.03] dark:hover:bg-white/[0.03]",
                )}
              >
                <Avatar
                  size={40}
                  src={
                    item.customerAvatarUrl ||
                    generatedAvatar(item.customerName || item.customerPhone)
                  }
                >
                  {(item.customerName || item.customerPhone || "?").slice(0, 1).toUpperCase()}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-semibold text-food-text">
                      {customerLabel(item)}
                    </span>
                    <span className="shrink-0 text-[11px] text-food-muted">
                      {relativeTime(item.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <Tag
                      className="!m-0 !text-[10px]"
                      color={human ? "purple" : "default"}
                      icon={human ? <UserSwitchOutlined /> : <RobotOutlined />}
                    >
                      {human ? "Em atendimento" : "Bot"}
                    </Tag>
                    <span className="truncate text-[11px] text-food-muted">
                      {conversationStateLabel(item.state)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-food-muted">
                    {item.lastMessagePreview || "Sem mensagens ainda"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section
        className={cn(
          "min-h-0 flex-col bg-[#efeae2] dark:bg-[#0b141a]",
          selectedId || isDesktop ? "flex" : "hidden",
          !selectedId && "hidden lg:flex",
        )}
      >
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <Empty description="Selecione uma conversa para atender" />
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-food-border bg-food-card px-3 py-2.5">
              <Button
                type="text"
                className="lg:!hidden"
                icon={<ArrowLeftOutlined />}
                onClick={() => setSelectedId(null)}
                aria-label="Voltar à lista"
              />
              <Avatar
                size={40}
                src={
                  selected.customerAvatarUrl ||
                  generatedAvatar(selected.customerName || selected.customerPhone)
                }
              >
                {(selected.customerName || selected.customerPhone || "?")
                  .slice(0, 1)
                  .toUpperCase()}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-food-text">
                  {customerLabel(selected)}
                </div>
                <div className="truncate text-xs text-food-muted">
                  {formatPhoneDisplay(selected.customerPhone)}
                  {selected.handoffMode === "human" && selected.handoffBy
                    ? ` · ${selected.handoffBy}`
                    : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {selected.handoffMode === "human" ? (
                  <Button
                    size="small"
                    loading={busyId === selected.id}
                    onClick={() => onRelease(selected)}
                  >
                    Devolver ao bot
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size="small"
                    loading={busyId === selected.id}
                    onClick={() => onTakeover(selected)}
                  >
                    Assumir
                  </Button>
                )}
              </div>
            </header>

            <div
              ref={threadRef}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-5"
            >
              {messagesQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <Spin />
                </div>
              ) : null}
              {messagesQuery.error ? (
                <Alert
                  type="error"
                  showIcon
                  message={
                    messagesQuery.error instanceof Error
                      ? messagesQuery.error.message
                      : "Falha ao carregar mensagens."
                  }
                />
              ) : null}
              {!messagesQuery.isLoading && !(messagesQuery.data ?? []).length ? (
                <Empty
                  className="py-10"
                  description="Ainda sem mensagens neste chat. Novas mensagens aparecem aqui."
                />
              ) : null}
              {(messagesQuery.data ?? []).map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>

            <footer className="shrink-0 border-t border-food-border bg-food-card p-3">
              {selected.handoffMode !== "human" ? (
                <p className="mb-2 text-xs text-food-muted">
                  O bot está atendendo. Ao enviar uma mensagem, o atendimento é
                  assumido automaticamente.
                </p>
              ) : null}
              <div className="flex items-end gap-2">
                <Input.TextArea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Digite uma mensagem"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      submitMessage();
                    }
                  }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  disabled={!draft.trim()}
                  onClick={submitMessage}
                  aria-label="Enviar"
                />
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

function MessageChecks({ pending }: { pending: boolean }) {
  if (pending) {
    return (
      <CheckOutlined className="text-[11px] opacity-70" aria-label="Enviando" />
    );
  }
  return (
    <span className="relative inline-flex w-[14px]" aria-label="Enviado">
      <CheckOutlined className="text-[11px] opacity-80" />
      <CheckOutlined className="absolute left-[5px] text-[11px] opacity-80" />
    </span>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const mine = message.direction === "outbound";
  const pending = message.id.startsWith("temp-");
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[min(100%,420px)] rounded-2xl px-3 py-2 text-sm shadow-sm",
          mine
            ? "rounded-br-md bg-[#d9fdd3] text-food-text dark:bg-[#005c4b] dark:text-white"
            : "rounded-bl-md bg-white text-food-text dark:bg-[#1f2c34] dark:text-white",
          pending && "opacity-90",
        )}
      >
        {mine && message.author !== "customer" ? (
          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
            {message.author === "agent" ? "Atendente" : "Bot"}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
          <span>{clock(message.createdAt)}</span>
          {mine ? <MessageChecks pending={pending} /> : null}
        </div>
      </div>
    </div>
  );
}
