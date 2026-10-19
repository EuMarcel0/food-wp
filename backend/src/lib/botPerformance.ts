const BOT_DONE_STATUSES = new Set(["accepted", "ready", "out_for_delivery", "delivered"]);

/** Uma intervenção do atendente no dia (pedido e/ou conversa assumida). */
export type BotInterventionItem = {
  /** Telefone WhatsApp do cliente (dígitos, com DDI quando houver). */
  phone: string;
  customerName: string | null;
  orderId: string | null;
  orderCode: string | null;
  orderStatus: string | null;
  conversationId: string | null;
  /** Quem clicou em Assumir (quando ainda está na conversa). */
  handoffBy: string | null;
  /** Horário de referência: criação do pedido ou Assumir. */
  at: string;
};

export type BotPerformanceReport = {
  day: string;
  total: number;
  /** Chegaram a Aceito (ou além) sem o atendente assumir. */
  botOnly: number;
  /** O atendente clicou em Assumir durante o pedido. */
  humanAssisted: number;
  /** Ainda em Recebido ou cancelados sem intervenção. */
  other: number;
  /** false enquanto a migration 056 não rodou (intervenções não são contadas). */
  tracking: boolean;
  /** Detalhe das intervenções do dia (telefone para consultar no Zap). */
  interventions: BotInterventionItem[];
};

export function summarizeBotPerformance(
  day: string,
  rows: { status: string; humanAssisted: boolean }[],
  tracking: boolean,
  interventions: BotInterventionItem[] = [],
): BotPerformanceReport {
  let botOnly = 0;
  let humanAssisted = 0;
  let other = 0;
  for (const row of rows) {
    if (row.humanAssisted) humanAssisted += 1;
    else if (BOT_DONE_STATUSES.has(row.status)) botOnly += 1;
    else other += 1;
  }
  return { day, total: rows.length, botOnly, humanAssisted, other, tracking, interventions };
}

export function phoneDigits(raw?: string | null) {
  return String(raw ?? "").replace(/\D/g, "");
}

/** Junta pedidos com intervenção e conversas assumidas no dia (chave = telefone). */
export function mergeBotInterventions(
  orders: {
    id: string;
    code: string;
    status: string;
    createdAt: string;
    phone: string;
    customerName: string | null;
  }[],
  conversations: {
    id: string;
    phone: string;
    customerName: string | null;
    handoffBy: string | null;
    at: string;
  }[],
): BotInterventionItem[] {
  const byPhone = new Map<string, BotInterventionItem>();

  for (const order of orders) {
    const key = phoneDigits(order.phone);
    if (!key) continue;
    byPhone.set(key, {
      phone: key,
      customerName: order.customerName,
      orderId: order.id,
      orderCode: order.code,
      orderStatus: order.status,
      conversationId: null,
      handoffBy: null,
      at: order.createdAt,
    });
  }

  for (const conversation of conversations) {
    const key = phoneDigits(conversation.phone);
    if (!key) continue;
    const existing = byPhone.get(key);
    if (existing) {
      existing.conversationId = conversation.id;
      if (conversation.handoffBy) existing.handoffBy = conversation.handoffBy;
      if (!existing.customerName && conversation.customerName) {
        existing.customerName = conversation.customerName;
      }
      continue;
    }
    byPhone.set(key, {
      phone: key,
      customerName: conversation.customerName,
      orderId: null,
      orderCode: null,
      orderStatus: null,
      conversationId: conversation.id,
      handoffBy: conversation.handoffBy,
      at: conversation.at,
    });
  }

  return [...byPhone.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
