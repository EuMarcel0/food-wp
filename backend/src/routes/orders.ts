import { Router } from "express";
import {
  getOrderStats,
  listOrdersPage,
  updateOrderStatus,
} from "../data/repository.js";
import { parseOptionalText, parseSearch } from "../lib/filters.js";
import { parsePageQuery } from "../lib/pagination.js";
import { notifyCustomerOrderStatus } from "../lib/orderNotify.js";
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
    order = await updateOrderStatus(
      req.params.id,
      status,
      actorName,
      status === "preparing" ? Math.round(Number(prepMinutes)) : undefined,
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
