import { useState } from "react";
import {
  AppstoreOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  ShoppingOutlined,
  TagsOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Grid, Layout, Menu, Tooltip, Typography, theme } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ConnectionStatus } from "./ConnectionStatus";
import { NotificationBell } from "../notifications/NotificationBell";
import { NotificationProvider } from "../notifications/NotificationProvider";
import { UserMenu } from "./UserMenu";
import { cn } from "../lib/cn";
import { foodMark } from "../ui";

const SIDER_STORAGE_KEY = "food-wp-sider-collapsed";

const items = [
  { key: "/", icon: <ThunderboltOutlined />, label: "Painel" },
  { key: "/pedidos", icon: <ShoppingOutlined />, label: "Pedidos" },
  { key: "/cardapio", icon: <AppstoreOutlined />, label: "Cardápio" },
  { key: "/categorias", icon: <TagsOutlined />, label: "Categorias" },
  { key: "/configuracoes", icon: <SettingOutlined />, label: "Configurações" },
];

function readSiderCollapsed() {
  try {
    return localStorage.getItem(SIDER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function SiderBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-4 pb-3.5 pt-5 text-zinc-50",
        compact && "justify-center px-3",
      )}
    >
      <div className={foodMark} aria-hidden="true">
        🍽️
      </div>
      {compact ? null : (
        <div>
          <strong className="block text-base leading-tight tracking-tight">
            Food WP
          </strong>
          <span className="block text-xs text-zinc-400">Retaguarda do bot</span>
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readSiderCollapsed);

  function go(path: string) {
    navigate(path);
    setDrawerOpen(false);
  }

  function toggleSider() {
    setCollapsed((current) => {
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
      theme="dark"
      mode="inline"
      selectedKeys={[location.pathname]}
      items={items}
      onClick={(item) => go(item.key)}
    />
  );

  return (
    <NotificationProvider>
    <Layout className="relative h-full min-h-0 flex-1 overflow-hidden" hasSider={!isMobile}>
      <a
        className="absolute top-3 left-3 z-[4000] -translate-y-[160%] rounded-[10px] bg-food-accent px-3 py-2 text-[13px] font-bold text-white no-underline transition-transform duration-150 focus:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none"
        href="#conteudo"
      >
        Ir para o conteúdo
      </a>
      {isMobile ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={236}
          className="[&_.ant-drawer-body]:border-r [&_.ant-drawer-body]:border-zinc-900"
          styles={{
            body: { padding: 0, background: "#050506" },
            header: { display: "none" },
          }}
        >
          <SiderBrand />
          <nav aria-label="Menu principal">{menu}</nav>
        </Drawer>
      ) : (
        <Layout.Sider
          className="h-full overflow-auto border-r border-zinc-900"
          width={236}
          collapsedWidth={72}
          collapsed={collapsed}
          theme="dark"
        >
          <SiderBrand compact={collapsed} />
          <nav aria-label="Menu principal">{menu}</nav>
        </Layout.Sider>
      )}
      <Layout className="h-full min-h-0 min-w-0 overflow-hidden">
        <Layout.Header
          className="flex h-[60px] shrink-0 items-center justify-between gap-3 px-5 leading-[60px] backdrop-blur-md max-lg:px-3"
          style={{ borderBottom: `1px solid ${token.colorBorder}` }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip
              title={
                isMobile
                  ? undefined
                  : collapsed
                    ? "Expandir menu"
                    : "Recolher menu"
              }
            >
              <Button
                className="inline-flex"
                type="text"
                aria-label={
                  isMobile
                    ? "Abrir menu"
                    : collapsed
                      ? "Expandir menu"
                      : "Recolher menu"
                }
                icon={
                  isMobile ? (
                    <MenuOutlined />
                  ) : collapsed ? (
                    <MenuUnfoldOutlined />
                  ) : (
                    <MenuFoldOutlined />
                  )
                }
                onClick={() => (isMobile ? setDrawerOpen(true) : toggleSider())}
              />
            </Tooltip>
            <Typography.Text
              strong
              className="truncate font-semibold tracking-tight max-sm:text-sm"
            >
              Atendimento por WhatsApp
            </Typography.Text>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <NotificationBell />
            <UserMenu />
          </div>
        </Layout.Header>
        <Layout.Content
          id="conteudo"
          className={cn(
            "min-h-0 min-w-0 flex-1 scroll-mt-3",
            location.pathname === "/pedidos"
              ? "flex flex-col overflow-hidden px-4 py-3 max-lg:overflow-auto max-lg:px-3.5 max-lg:py-3"
              : "overflow-auto px-7 py-6 pb-8 max-lg:px-3.5 max-lg:py-4 max-lg:pb-6",
          )}
          tabIndex={-1}
        >
          <div
            className={
              location.pathname === "/pedidos"
                ? "flex min-h-0 w-full flex-1 flex-col max-lg:h-auto max-lg:flex-none"
                : "mx-auto w-full max-w-[1200px]"
            }
          >
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
    </NotificationProvider>
  );
}
