import { Router } from "express";
import {
  claimAutoPrint,
  completeAutoPrint,
  failAutoPrint,
  getOrder,
  getOrderStats,
  getSalesByPaymentReport,
  listAutoPrintQueue,
  listOrderLogs,
  listOrdersPage,
  updateOrderItems,
  updateOrderPayment,
  updateOrderStatus,
} from "../data/repository.js";
import {
  parseDateDay,
  parseOptionalText,
  parseSearch,
} from "../lib/filters.js";
import { parsePageQuery } from "../lib/pagination.js";
import { notifyCustomerOrderStatus } from "../lib/orderNotify.js";
import type { OrderStatus, PaymentMethod } from "../types.js";

const STATUSES = new Set<OrderStatus>([
  "received",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

const PAYMENT_METHODS = new Set([
  "pix",
  "cash",
  "card",
  "credit",
  "debit",
  "other",
]);

export const ordersRouter = Router();

ordersRouter.get("/stats", async (req, res) => {
  const day = parseOptionalText(req.query.day);
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    res.status(400).json({ error: "Informe a data no formato YYYY-MM-DD." });
    return;
  }
  res.json(await getOrderStats(day));
});

ordersRouter.get("/reports/sales-by-payment", async (req, res) => {
  try {
    let fromDay = parseOptionalText(req.query.from ?? req.query.createdFrom);
    let toDay = parseOptionalText(req.query.to ?? req.query.createdTo);
    if (fromDay && toDay && fromDay > toDay) {
      const swap = fromDay;
      fromDay = toDay;
      toDay = swap;
    }

    const rawParts: string[] = [];
    const multi = req.query.paymentMethods ?? req.query.paymentMethod;
    if (Array.isArray(multi)) {
      for (const item of multi) {
        rawParts.push(...String(item).split(","));
      }
    } else if (multi != null && String(multi).trim()) {
      rawParts.push(...String(multi).split(","));
    }

    const paymentMethods = [
      ...new Set(
        rawParts
          .map((item) => item.trim().toLowerCase())
          .filter((item) => item && item !== "all"),
      ),
    ];
    if (paymentMethods.some((item) => !PAYMENT_METHODS.has(item))) {
      res.status(400).json({ error: "Forma de pagamento inválida." });
      return;
    }

    res.json(
      await getSalesByPaymentReport({
        createdFrom: parseDateDay(fromDay, false),
        createdTo: parseDateDay(toDay, true),
        paymentMethods,
      }),
    );
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Falha ao montar o relatório de vendas.",
    });
  }
});

/** Fila de cupons pendentes (agente / estação da cozinha). */
ordersRouter.get("/print-queue", async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
    res.json({ items: await listAutoPrintQueue(limit) });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Falha ao listar fila de impressão.",
    });
  }
});

ordersRouter.get("/", async (req, res) => {
  const { page, limit } = parsePageQuery(req.query);
  let fromDay = parseOptionalText(req.query.from ?? req.query.createdFrom);
  let toDay = parseOptionalText(req.query.to ?? req.query.createdTo);
  if (fromDay && toDay && fromDay > toDay) {
    const swap = fromDay;
    fromDay = toDay;
    toDay = swap;
  }
  const lifecycleRaw = String(req.query.lifecycle ?? "active")
    .trim()
    .toLowerCase();
  const lifecycle =
    lifecycleRaw === "cancelled"
      ? ("cancelled" as const)
      : ("active" as const);

  res.json(
    await listOrdersPage(page, limit, {
      q: parseSearch(req.query.q),
      status: parseOptionalText(req.query.status),
      fulfillment: parseOptionalText(req.query.fulfillment),
      lifecycle,
      createdFrom: parseDateDay(fromDay, false),
      createdTo: parseDateDay(toDay, true),
    }),
  );
});

ordersRouter.post("/:id/print-claim", async (req, res) => {
  try {
    const claimedBy = String(req.body?.claimedBy ?? "").trim() || "station";
    const order = await claimAutoPrint(String(req.params.id), claimedBy);
    if (!order) {
      res.status(409).json({
        error: "Pedido já impresso ou reservado por outra estação.",
      });
      return;
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Falha ao reservar impressão.",
    });
  }
});

ordersRouter.post("/:id/print-complete", async (req, res) => {
  try {
    const claimedBy = String(req.body?.claimedBy ?? "").trim() || undefined;
    const order = await completeAutoPrint(String(req.params.id), claimedBy);
    if (!order) {
      res.status(409).json({ error: "Não foi possível confirmar a impressão." });
      return;
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Falha ao confirmar impressão.",
    });
  }
});

ordersRouter.post("/:id/print-fail", async (req, res) => {
  try {
    const claimedBy = String(req.body?.claimedBy ?? "").trim();
    if (!claimedBy) {
      res.status(400).json({ error: "Informe claimedBy." });
      return;
    }
    const ok = await failAutoPrint(String(req.params.id), claimedBy);
    res.json({ ok });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Falha ao liberar impressão.",
    });
  }
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await getOrder(String(req.params.id));
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  res.json(order);
});

ordersRouter.patch("/:id/status", async (req, res) => {
  const status = String(req.body?.status ?? "") as OrderStatus;
  if (!STATUSES.has(status)) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }

  const actorName = String(req.body?.actorName ?? "").trim() || "Equipe";
  const rawPrep = req.body?.prepMinutes;
  const prepMinutes =
    rawPrep === undefined || rawPrep === null || rawPrep === ""
      ? undefined
      : Number(rawPrep);
  const cancelReason =
    status === "cancelled"
      ? String(req.body?.cancelReason ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 240)
      : undefined;

  if (status === "preparing") {
    if (!Number.isFinite(prepMinutes) || Number(prepMinutes) < 1) {
      res.status(400).json({ error: "Informe o tempo de preparo em minutos." });
      return;
    }
  }

  if (status === "cancelled" && (!cancelReason || cancelReason.length < 3)) {
    res.status(400).json({
      error: "Informe o motivo do cancelamento (mín. 3 caracteres).",
    });
    return;
  }

  let order;
  try {
    const minutesForStatus =
      status === "preparing" || status === "accepted"
        ? prepMinutes !== undefined && Number.isFinite(prepMinutes)
          ? Math.round(Number(prepMinutes))
          : undefined
        : undefined;
    order = await updateOrderStatus(
      req.params.id,
      status,
      actorName,
      minutesForStatus,
      cancelReason,
    );
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o status.",
    });
    return;
  }
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  await notifyCustomerOrderStatus(order).catch((error) => {
    console.error("Falha ao notificar cliente", error);
  });

  res.json(order);
});

ordersRouter.patch("/:id/payment", async (req, res) => {
  const paymentMethod = String(req.body?.paymentMethod ?? "").trim() as PaymentMethod;
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    res.status(400).json({ error: "Forma de pagamento inválida." });
    return;
  }

  const actorName = String(req.body?.actorName ?? "").trim() || "Equipe";
  const rawLabel = req.body?.paymentMethodLabel;
  const paymentMethodLabel =
    rawLabel === undefined || rawLabel === null
      ? undefined
      : String(rawLabel).trim() || null;

  const rawChange = req.body?.changeForCents;
  const changeForCents =
    rawChange === undefined
      ? undefined
      : rawChange === null || rawChange === ""
        ? null
        : Number(rawChange);

  if (
    changeForCents !== undefined &&
    changeForCents !== null &&
    (!Number.isFinite(changeForCents) || changeForCents < 0)
  ) {
    res.status(400).json({ error: "Valor de troco inválido." });
    return;
  }

  let order;
  try {
    order = await updateOrderPayment(req.params.id, {
      paymentMethod,
      paymentMethodLabel,
      changeForCents,
      actorName,
    });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o pagamento.",
    });
    return;
  }
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  res.json(order);
});

ordersRouter.get("/:id/logs", async (req, res) => {
  try {
    const order = await getOrder(String(req.params.id));
    if (!order) {
      res.status(404).json({ error: "Pedido não encontrado." });
      return;
    }
    const items = await listOrderLogs(order.id);
    res.json({ items });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Falha ao carregar logs do pedido.",
    });
  }
});

ordersRouter.patch("/:id/items", async (req, res) => {
  const actorName = String(req.body?.actorName ?? "").trim() || "Equipe";
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!rawItems) {
    res.status(400).json({ error: "Envie a lista de itens." });
    return;
  }

  const items = rawItems.map((item: Record<string, unknown>) => ({
    id: item.id != null ? String(item.id) : undefined,
    productId: item.productId != null ? String(item.productId) : null,
    name: String(item.name ?? ""),
    quantity: Number(item.quantity),
    unitPriceCents: Number(item.unitPriceCents),
    extras: Array.isArray(item.extras) ? item.extras : [],
    notes: item.notes != null ? String(item.notes) : null,
  }));

  let order;
  try {
    order = await updateOrderItems(String(req.params.id), { items, actorName });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar os itens.",
    });
    return;
  }
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  res.json(order);
});
