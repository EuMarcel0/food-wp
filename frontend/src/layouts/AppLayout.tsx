import { useEffect, useMemo, useState } from "react";
import {
  AppstoreOutlined,
  CommentOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  PlusCircleOutlined,
  SettingOutlined,
  ShoppingOutlined,
  TagsOutlined,
  ThunderboltOutlined
} from "@ant-design/icons";
import { Badge, Button, Drawer, Grid, Layout, Menu, Tooltip, Typography, theme } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ConnectionStatus } from "./ConnectionStatus";
import { NotificationBell } from "../notifications/NotificationBell";
import { NotificationProvider } from "../notifications/NotificationProvider";
import { UserMenu } from "./UserMenu";
import { api } from "../lib/api";
import {
  CONVERSATION_READ_EVENT,
  hasUnreadConversations,
} from "../lib/conversationBadge";
import { queryKeys } from "../lib/queryKeys";
import { ConversationAlertsProvider, CONVERSATIONS_LIVE_EVENT } from "../conversations/ConversationAlerts";
import { cn } from "../lib/cn";
import { foodMark } from "../ui";

const SIDER_STORAGE_KEY = "food-wp-sider-collapsed";

function readSiderCollapsed() {
  try {
    return localStorage.getItem(SIDER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function SiderBrand({
  compact = false,
  name,
  photoUrl
}: {
  compact?: boolean;
  name?: string;
  photoUrl?: string | null;
}) {
  const label = name?.trim() || "Food WP";
  return (
    <div className={cn("flex items-center gap-2.5 px-4 pb-3.5 pt-5 text-zinc-50", compact && "justify-center px-3")}>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=''
          className='size-[34px] shrink-0 rounded-[10px] object-cover shadow-[0_6px_16px_rgba(232,93,4,0.28)]'
        />
      ) : (
        <div className={foodMark} aria-hidden='true'>
          🍽️
        </div>
      )}
      {compact ? null : (
        <div className='min-w-0'>
          <strong className='block truncate text-base leading-tight tracking-tight'>{label}</strong>
          <span className='block text-xs text-zinc-400'>Retaguarda do bot</span>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.lg === false;
  const usesFillLayout =
    location.pathname === "/pedidos" ||
    location.pathname === "/conversas" ||
    (!isMobile && ["/cardapio", "/categorias", "/adicionais"].includes(location.pathname));
  const isConversasMobile = isMobile && location.pathname === "/conversas";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readSiderCollapsed);
  const storeQuery = useQuery({
    queryKey: queryKeys.store,
    queryFn: api.store
  });
  const storeName = storeQuery.data?.name;
  const storePhoto = storeQuery.data?.profilePhotoUrl;
  const [seenTick, setSeenTick] = useState(0);
  const liveQuery = useQuery({
    queryKey: queryKeys.conversations.live,
    queryFn: () => api.conversations("active", true),
    refetchInterval: 12_000,
  });
  const liveConversations = liveQuery.data ?? [];
  const liveKey = liveConversations
    .map(
      (item) =>
        `${item.id}:${item.lastMessageAt}:${item.lastInboundAt ?? ""}:${item.lastMessageDirection ?? ""}`,
    )
    .join("|");
  const hasUnread = useMemo(
    () => hasUnreadConversations(liveConversations),
    [liveKey, seenTick],
  );
  const showConversasDot = hasUnread;

  useEffect(() => {
    const bump = () => setSeenTick((value) => value + 1);
    window.addEventListener(CONVERSATION_READ_EVENT, bump);
    window.addEventListener(CONVERSATIONS_LIVE_EVENT, bump);
    return () => {
      window.removeEventListener(CONVERSATION_READ_EVENT, bump);
      window.removeEventListener(CONVERSATIONS_LIVE_EVENT, bump);
    };
  }, []);

  const menuItems = useMemo(
    () => [
      { key: "/", icon: <ThunderboltOutlined />, label: "Painel" },
      { key: "/pedidos", icon: <ShoppingOutlined />, label: "Pedidos" },
      {
        key: "/conversas",
        icon: (
          <Badge dot={showConversasDot} offset={[-1, 2]} color="#ef4444">
            <CommentOutlined />
          </Badge>
        ),
        label: "Conversas",
      },
      { key: "/cardapio", icon: <AppstoreOutlined />, label: "Cardápio" },
      { key: "/categorias", icon: <TagsOutlined />, label: "Categorias" },
      { key: "/adicionais", icon: <PlusCircleOutlined />, label: "Adicionais" },
      { key: "/configuracoes", icon: <SettingOutlined />, label: "Configurações" },
    ],
    [showConversasDot],
  );

  function go(path: string) {
    navigate(path);
    setDrawerOpen(false);
  }

  function toggleSider() {
    setCollapsed(current => {
      const next = !current;
      try {
        localStorage.setItem(SIDER_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // storage bloqueado
      }
      return next;
    });
  }

  const menu = (
    <Menu
      theme='dark'
      mode='inline'
      selectedKeys={[location.pathname]}
      items={menuItems}
      onClick={item => go(item.key)}
    />
  );

  return (
    <NotificationProvider>
      <ConversationAlertsProvider conversations={liveConversations}>
      <Layout
        className='relative min-h-0 flex-1 overflow-hidden bg-food-bg'
        style={{ height: "100%", maxHeight: "100%", flex: "1 1 0%" }}
        hasSider={!isMobile}
      >
        <a
          className='absolute top-3 left-3 z-[4000] -translate-y-[160%] rounded-[10px] bg-food-accent px-3 py-2 text-[13px] font-bold text-white no-underline transition-transform duration-150 focus:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none'
          href='#conteudo'
        >
          Ir para o conteúdo
        </a>
        {isMobile ? (
          <Drawer
            placement='left'
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            width={236}
            className='[&_.ant-drawer-body]:border-r [&_.ant-drawer-body]:border-zinc-900'
            styles={{
              body: { padding: 0, background: "#050506" },
              header: { display: "none" }
            }}
          >
            <SiderBrand name={storeName} photoUrl={storePhoto} />
            <nav aria-label='Menu principal'>{menu}</nav>
          </Drawer>
        ) : (
          <Layout.Sider
            className='h-full overflow-auto border-r border-zinc-900'
            width={236}
            collapsedWidth={72}
            collapsed={collapsed}
            theme='dark'
          >
            <SiderBrand compact={collapsed} name={storeName} photoUrl={storePhoto} />
            <nav aria-label='Menu principal'>{menu}</nav>
          </Layout.Sider>
        )}
        <Layout className='h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-food-bg'>
          <Layout.Header
            className='flex h-15 shrink-0 items-center justify-between gap-2 leading-15 backdrop-blur-md'
            style={{ borderBottom: `1px solid ${token.colorBorder}`, paddingInline: 8 }}
          >
            <div className='flex min-w-0 items-center gap-2'>
              <Tooltip title={isMobile ? undefined : collapsed ? "Expandir menu" : "Recolher menu"}>
                <Button
                  className='inline-flex'
                  type='text'
                  aria-label={isMobile ? "Abrir menu" : collapsed ? "Expandir menu" : "Recolher menu"}
                  icon={isMobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => (isMobile ? setDrawerOpen(true) : toggleSider())}
                />
              </Tooltip>
              <Typography.Text strong className='truncate font-semibold tracking-tight max-sm:text-sm'>
                Atendimento por WhatsApp
              </Typography.Text>
            </div>
            <div className='flex items-center gap-2'>
              <ConnectionStatus />
              <NotificationBell />
              <UserMenu />
            </div>
          </Layout.Header>
          <Layout.Content
            id='conteudo'
            className={cn(
              "min-h-0 min-w-0 flex-1 scroll-mt-3 bg-food-bg",
              usesFillLayout
                ? cn(
                    "flex h-full min-h-0 flex-col overflow-hidden px-4 py-3",
                    isConversasMobile
                      ? "max-lg:h-full max-lg:overflow-hidden max-lg:px-0 max-lg:py-0"
                      : "max-lg:h-auto max-lg:overflow-auto max-lg:px-3.5",
                  )
                : "overflow-auto px-7 py-6 pb-8 max-lg:px-3.5 max-lg:py-4 max-lg:pb-6",
            )}
            tabIndex={-1}
          >
            <div
              className={
                usesFillLayout
                  ? cn(
                      "flex h-full min-h-0 w-full flex-1 flex-col",
                      isConversasMobile
                        ? "max-lg:h-full max-lg:min-h-0 max-lg:flex-1"
                        : "max-lg:h-auto max-lg:flex-none",
                    )
                  : "mx-auto min-h-full w-full max-w-[1200px]"
              }
            >
              <Outlet />
            </div>
          </Layout.Content>
        </Layout>
      </Layout>
      </ConversationAlertsProvider>
    </NotificationProvider>
  );
}
