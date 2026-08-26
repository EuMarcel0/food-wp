import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { App, ConfigProvider } from "antd";
import ptBR from "antd/locale/pt_BR";
import { DialogProvider } from "../dialog";
import { ToastBridge } from "../components/ToastBridge";
import {
  THEME_STORAGE_KEY,
  darkTheme,
  lightTheme,
  type ThemeMode,
} from "../theme";

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", resolved === "dark" ? "#09090B" : "#E85D04");
  }, [resolved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved,
      setMode(next) {
        setModeState(next);
        localStorage.setItem(THEME_STORAGE_KEY, next);
      },
    }),
    [mode, resolved],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        locale={ptBR}
        componentSize="middle"
        theme={resolved === "dark" ? darkTheme : lightTheme}
      >
        <App
          message={{
            maxCount: 3,
            duration: 5,
            top: 16,
          }}
        >
          <ToastBridge />
          <DialogProvider>{children}</DialogProvider>
        </App>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeMode precisa estar dentro de ThemeProvider");
  }
  return context;
}
