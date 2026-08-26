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

function SiderBrand() {
  return (
    <div className="food-sider-brand">
      <div className="food-mark" aria-hidden="true">🍽️</div>
      <div className="food-sider-copy">
        <strong>Food WP</strong>
        <span>Retaguarda do bot</span>
      </div>
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
    <Layout className="app-shell" hasSider={!isMobile}>
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      {isMobile ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={236}
          className="app-drawer"
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
          className="app-sider"
          width={236}
          collapsedWidth={72}
          collapsed={collapsed}
          theme="dark"
        >
          <SiderBrand />
          <nav aria-label="Menu principal">{menu}</nav>
        </Layout.Sider>
      )}
      <Layout className="app-main">
        <Layout.Header
          className="app-header"
          style={{ borderBottom: `1px solid ${token.colorBorder}` }}
        >
          <div className="app-header-left">
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
                className="app-menu-trigger"
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
            <Typography.Text strong className="app-header-title">
              Atendimento por WhatsApp
            </Typography.Text>
          </div>
          <div className="app-header-right">
            <ConnectionStatus />
            <NotificationBell />
            <UserMenu />
          </div>
        </Layout.Header>
        <Layout.Content id="conteudo" className="app-content" tabIndex={-1}>
          <div className="app-page">
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
    </NotificationProvider>
  );
}
