import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Alert, Button } from "antd";
import { UserSwitchOutlined } from "@ant-design/icons";
import { flattenLiveConversationPages } from "../conversations/realtimeCache";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

/** A partir deste número de conversas com bot pausado, o alerta aparece. */
export const HUMAN_HANDOFF_ALERT_THRESHOLD = 10;

const LIVE_LIST_FIRST_PAGE = 30;
const LIVE_LIST_PAGE_SIZE = 15;

/**
 * Alerta no topo do Painel e de Pedidos quando há muitas conversas
 * com atendimento humano (bot pausado) — o atendente precisa devolver ao bot.
 */
export function HumanHandoffAlert() {
  const liveQuery = useInfiniteQuery({
    queryKey: queryKeys.conversations.live,
    queryFn: ({ pageParam }) =>
      api.conversations(true, {
        limit: pageParam === 0 ? LIVE_LIST_FIRST_PAGE : LIVE_LIST_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextOffset != null ? lastPage.nextOffset : undefined,
    refetchInterval: 30_000,
    networkMode: "always",
  });

  const humanCount = useMemo(() => {
    const items = flattenLiveConversationPages(liveQuery.data?.pages);
    return items.filter((item) => item.handoffMode === "human").length;
  }, [liveQuery.data]);

  if (humanCount < HUMAN_HANDOFF_ALERT_THRESHOLD) return null;

  return (
    <Alert
      className="mb-4 shrink-0 [&_.ant-alert-message]:font-semibold"
      type="warning"
      showIcon
      icon={<UserSwitchOutlined />}
      message={`${humanCount} conversas com o bot pausado`}
      description={
        <span>
          Há {humanCount} clientes em atendimento humano. Devolva ao bot as conversas que já
          foram resolvidas para o robô voltar a atender.
        </span>
      }
      action={
        <Link to="/conversas">
          <Button size="small" type="primary">
            Ver conversas
          </Button>
        </Link>
      }
    />
  );
}
