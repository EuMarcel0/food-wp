import { Router } from "express";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../data/repository.js";

export const notificationsRouter = Router();

function readerFrom(value: unknown) {
  const raw = String(value ?? "").trim();
  return raw || "demo";
}

notificationsRouter.get("/", async (req, res) => {
  res.json(await listNotifications(readerFrom(req.query.reader)));
});

notificationsRouter.patch("/read-all", async (req, res) => {
  const reader = readerFrom(req.body?.reader ?? req.query.reader);
  const count = await markAllNotificationsRead(reader);
  res.json({ ok: true, count });
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  const reader = readerFrom(req.body?.reader ?? req.query.reader);
  const ok = await markNotificationRead(String(req.params.id), reader);
  if (!ok) {
    res.status(404).json({ error: "Notificação não encontrada." });
    return;
  }
  res.json({ ok: true });
});
