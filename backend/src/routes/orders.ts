import { Router } from "express";
import {
  getOrderStats,
  listOrdersPage,
  updateOrderStatus,
} from "../data/repository.js";
import { parseOptionalText, parseSearch } from "../lib/filters.js";
import { parsePageQuery } from "../lib/pagination.js";
import { sendText } from "../lib/whatsapp.js";
import { formatBRL } from "../lib/money.js";
import { describeOrderStatus } from "../conversation/status.js";
import type { OrderStatus } from "../types.js";

const STATUSES = new Set<OrderStatus>([
  "received",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

export const ordersRouter = Router();

ordersRouter.get("/stats", async (_req, res) => {
  res.json(await getOrderStats());
});

ordersRouter.get("/", async (req, res) => {
  const { page, limit } = parsePageQuery(req.query);
  res.json(
    await listOrdersPage(page, limit, {
      q: parseSearch(req.query.q),
      status: parseOptionalText(req.query.status),
      fulfillment: parseOptionalText(req.query.fulfillment),
    }),
  );
});

ordersRouter.patch("/:id/status", async (req, res) => {
  const status = String(req.body?.status ?? "") as OrderStatus;
  if (!STATUSES.has(status)) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }

  const actorName = String(req.body?.actorName ?? "").trim() || "Equipe";
  const order = await updateOrderStatus(req.params.id, status, actorName);
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }

  if (order.customerPhone) {
    await sendText(
      order.customerPhone,
      `Atualização do pedido *#${order.code}*: agora está *${describeOrderStatus(order.status)}*.\nTotal: ${formatBRL(order.totalCents)}.`,
    ).catch((error) => {
      console.error("Falha ao notificar cliente", error);
    });
  }

  res.json(order);
});
