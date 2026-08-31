import { Router } from "express";
import {
  getConversationById,
  listLiveConversations,
  setConversationHandoff,
} from "../data/repository.js";
import { getSupabase } from "../lib/supabase.js";
import { sendText } from "../lib/whatsapp.js";
import { memoryStore } from "../data/memory.js";

export const conversationsRouter = Router();

conversationsRouter.get("/", async (_req, res) => {
  try {
    res.json(await listLiveConversations(24));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao listar conversas.",
    });
  }
});

conversationsRouter.post("/:id/takeover", async (req, res) => {
  try {
    const id = String(req.params.id);
    const by =
      typeof req.body?.by === "string" && req.body.by.trim()
        ? req.body.by.trim().slice(0, 80)
        : null;

    const current = await getConversationById(id);
    if (!current) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }

    const updated = await setConversationHandoff(id, "human", by);
    if (!updated) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }

    const phone = await customerPhoneFor(updated.customerId);
    if (phone) {
      await sendText(
        phone,
        "Um atendente da loja vai continuar este atendimento por aqui. Pode falar normalmente.",
      );
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao assumir conversa.",
    });
  }
});

conversationsRouter.post("/:id/release", async (req, res) => {
  try {
    const id = String(req.params.id);
    const current = await getConversationById(id);
    if (!current) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }

    const updated = await setConversationHandoff(id, "bot", null);
    if (!updated) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }

    const phone = await customerPhoneFor(updated.customerId);
    if (phone) {
      await sendText(
        phone,
        "Atendimento humano encerrado. Pode continuar comigo por aqui — digite *menu* ou toque nas opções.",
      );
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao devolver ao bot.",
    });
  }
});

async function customerPhoneFor(customerId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return memoryStore.findCustomerPhone(customerId);
  }
  const { data } = await supabase
    .from("customers")
    .select("wa_phone")
    .eq("id", customerId)
    .maybeSingle();
  return data?.wa_phone ? String(data.wa_phone) : null;
}
