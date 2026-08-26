export const webhookStats = {
  lastAt: null as string | null,
  lastMessages: 0,
  lastField: null as string | null,
};

export function noteWebhook(field: string | undefined, messageCount: number) {
  webhookStats.lastAt = new Date().toISOString();
  webhookStats.lastMessages = messageCount;
  webhookStats.lastField = field ?? null;
}
