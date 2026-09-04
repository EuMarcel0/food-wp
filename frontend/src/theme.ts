import { theme, type ThemeConfig } from "antd";

const sharedToken: ThemeConfig["token"] = {
  fontFamily: '"Plus Jakarta Sans", "Nunito", "Segoe UI", sans-serif',
  colorPrimary: "#E85D04",
  colorSuccess: "#22C55E",
  colorWarning: "#F59E0B",
  colorError: "#EF4444",
  colorInfo: "#E85D04",
  borderRadius: 12,
  controlHeight: 40,
  controlHeightSM: 32,
  controlHeightLG: 44,
  controlOutline: "rgba(232, 93, 4, 0.28)",
  controlOutlineWidth: 3,
  motionDurationMid: "0.2s",
};

const sharedComponents: ThemeConfig["components"] = {
  Input: {
    borderRadius: 10,
    paddingInline: 12,
  },
  Button: {
    primaryShadow: "none",
    borderRadius: 10,
    fontWeight: 650,
  },
  Card: {
    headerFontSize: 15,
    borderRadiusLG: 16,
  },
  Tag: {
    borderRadiusSM: 999,
  },
  Modal: {
    borderRadiusLG: 18,
  },
  Menu: {
    itemBorderRadius: 10,
    itemMarginInline: 8,
    itemMarginBlock: 4,
    itemHeight: 42,
    iconSize: 16,
    darkItemSelectedBg: "rgba(232, 93, 4, 0.16)",
    darkItemSelectedColor: "#FF8A3D",
  },
};

export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...sharedToken,
    colorText: "#18181B",
    colorTextSecondary: "#71717A",
    colorBgLayout: "#F4F4F5",
    colorBgContainer: "#FFFFFF",
    colorBorder: "#E4E4E7",
    colorBgElevated: "#FFFFFF",
  },
  components: {
    ...sharedComponents,
    Layout: {
      siderBg: "#09090B",
      headerBg: "#FFFFFF",
      bodyBg: "#F4F4F5",
      triggerBg: "#18181B",
      headerHeight: 44,
      headerPadding: "0 8px",
    },
    Menu: {
      ...sharedComponents.Menu,
      darkItemBg: "#09090B",
      darkSubMenuItemBg: "#09090B",
      darkItemColor: "#A1A1AA",
      darkItemHoverBg: "#18181B",
      darkItemHoverColor: "#FAFAFA",
    },
    Table: {
      headerBg: "#FAFAFA",
      headerColor: "#71717A",
      rowHoverBg: "#FAFAFA",
      borderColor: "#E4E4E7",
    },
  },
};

export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...sharedToken,
    colorText: "#FAFAFA",
    colorTextSecondary: "#A1A1AA",
    colorBgLayout: "#09090B",
    colorBgContainer: "#111113",
    colorBorder: "#27272A",
    colorBgElevated: "#18181B",
  },
  components: {
    ...sharedComponents,
    Layout: {
      siderBg: "#050506",
      headerBg: "#0C0C0E",
      bodyBg: "#09090B",
      triggerBg: "#000000",
      headerHeight: 44,
      headerPadding: "0 8px",
    },
    Menu: {
      ...sharedComponents.Menu,
      darkItemBg: "#050506",
      darkSubMenuItemBg: "#050506",
      darkItemColor: "#A1A1AA",
      darkItemHoverBg: "#18181B",
      darkItemHoverColor: "#FAFAFA",
    },
    Table: {
      headerBg: "#141416",
      headerColor: "#A1A1AA",
      rowHoverBg: "#18181B",
      borderColor: "#27272A",
    },
  },
};

export type ThemeMode = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "food-wp-theme";
