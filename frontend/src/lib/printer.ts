const KEY = "food-wp-default-printer";

export function getDefaultPrinter() {
  try {
    return localStorage.getItem(KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function setDefaultPrinter(name: string) {
  const value = name.trim();
  try {
    if (!value) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // storage bloqueado
  }
}
