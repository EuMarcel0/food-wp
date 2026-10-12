const BOT_ANALYTICS_EMAILS = new Set(["ojuarasiil@gmail.com"]);

/** Menu "Gráficos": liberado só para os e-mails da lista. */
export function canSeeBotAnalytics(email?: string | null) {
  return Boolean(email && BOT_ANALYTICS_EMAILS.has(email.trim().toLowerCase()));
}
