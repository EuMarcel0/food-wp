import { useState, type ReactNode } from "react";
import {
  CheckOutlined,
  DesktopOutlined,
  LogoutOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Dropdown } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { displayName, getAvatarUrl } from "../lib/profile";
import { useThemeMode } from "../theme/ThemeProvider";
import type { ThemeMode } from "../theme";
import { SettingsModal } from "./SettingsModal";

const THEME_ITEMS: { key: ThemeMode; label: string; icon: ReactNode }[] = [
  { key: "system", label: "Sistema", icon: <DesktopOutlined /> },
  { key: "light", label: "Claro", icon: <SunOutlined /> },
  { key: "dark", label: "Escuro", icon: <MoonOutlined /> },
];

export function UserMenu() {
  const { user, signOut } = useAuth();
  const { mode, setMode } = useThemeMode();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <Dropdown
        trigger={["click"]}
        placement="bottomRight"
        menu={{
          selectedKeys: [`theme:${mode}`],
          items: [
            {
              key: "profile",
              disabled: true,
              label: displayName(user) || user?.email || "Modo demonstração",
            },
            { type: "divider" },
            {
              key: "settings",
              icon: <SettingOutlined />,
              label: "Configuração",
              disabled: !user,
            },
            { type: "divider" },
            {
              key: "theme",
              type: "group",
              label: "Aparência",
              children: THEME_ITEMS.map((item) => ({
                key: `theme:${item.key}`,
                icon: item.icon,
                label: (
                  <span className="user-menu-item">
                    {item.label}
                    {mode === item.key ? <CheckOutlined /> : null}
                  </span>
                ),
              })),
            },
            { type: "divider" },
            {
              key: "logout",
              icon: <LogoutOutlined />,
              danger: true,
              label: "Sair",
            },
          ],
          onClick: ({ key }) => {
            if (key === "settings") {
              setSettingsOpen(true);
              return;
            }
            if (key.startsWith("theme:")) {
              setMode(key.slice("theme:".length) as ThemeMode);
              return;
            }
            if (key === "logout") {
              void signOut().then(() => navigate("/login"));
            }
          },
        }}
      >
        <Avatar
          className="user-avatar"
          src={user ? getAvatarUrl(user) : undefined}
          icon={!user ? <UserOutlined /> : undefined}
          style={{ backgroundColor: "#E85D04", cursor: "pointer" }}
        />
      </Dropdown>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPasswordChanged={() => {
          setSettingsOpen(false);
          navigate("/login", { replace: true });
        }}
      />
    </>
  );
}
