import { Router } from "express";
import {
  getOrder,
  getOrderStats,
  listOrdersPage,
  updateOrderStatus,
} from "../data/repository.js";
import {
  parseDateDay,
  parseOptionalText,
  parseSearch,
} from "../lib/filters.js";
import { parsePageQuery } from "../lib/pagination.js";
import { notifyCustomerOrderStatus } from "../lib/orderNotify.js";
import type { OrderStatus } from "../types.js";

const STATUSES = new Set<OrderStatus>([
  "received",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
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

ordersRouter.get("/", async (req, res) => {
  const { page, limit } = parsePageQuery(req.query);
  let fromDay = parseOptionalText(req.query.from ?? req.query.createdFrom);
  let toDay = parseOptionalText(req.query.to ?? req.query.createdTo);
  if (fromDay && toDay && fromDay > toDay) {
    const swap = fromDay;
    fromDay = toDay;
    toDay = swap;
  }
  res.json(
    await listOrdersPage(page, limit, {
      q: parseSearch(req.query.q),
      status: parseOptionalText(req.query.status),
      fulfillment: parseOptionalText(req.query.fulfillment),
      createdFrom: parseDateDay(fromDay, false),
      createdTo: parseDateDay(toDay, true),
    }),
  );
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

  if (status === "preparing") {
    if (!Number.isFinite(prepMinutes) || Number(prepMinutes) < 1) {
      res.status(400).json({ error: "Informe o tempo de preparo em minutos." });
      return;
    }
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
    );
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Não foi possível atualizar o status.",
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
