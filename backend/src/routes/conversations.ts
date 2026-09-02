import { Router } from "express";
import { resumeAfterHumanHandoff } from "../conversation/engine.js";
import {
  appendConversationMessage,
  closeConversationByAgent,
  getConversationById,
  listConversationHistory,
  listConversationMessages,
  listLiveConversations,
  setConversationHandoff,
} from "../data/repository.js";
import { getSupabase } from "../lib/supabase.js";
import { sendText } from "../lib/whatsapp.js";
import { memoryStore } from "../data/memory.js";

export const conversationsRouter = Router();

const AGENT_CLOSE_MESSAGE =
  "👋 Atendimento encerrado. Obrigado pelo contato! Quando quiser pedir de novo, é só mandar uma mensagem.";

conversationsRouter.get("/", async (req, res) => {
  try {
    const tab = String(req.query.tab ?? "active");
    if (tab === "history") {
      res.json(await listConversationHistory(100));
      return;
    }
    res.json(await listLiveConversations(24));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao listar conversas.",
    });
  }
});

conversationsRouter.get("/:id/messages", async (req, res) => {
  try {
    const id = String(req.params.id);
    const current = await getConversationById(id);
    if (!current) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }
    res.json(await listConversationMessages(id));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao listar mensagens.",
    });
  }
});

conversationsRouter.post("/:id/messages", async (req, res) => {
  try {
    const id = String(req.params.id);
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "Informe a mensagem." });
      return;
    }
    if (text.length > 4000) {
      res.status(400).json({ error: "Mensagem muito longa (máx. 4000)." });
      return;
    }

    const current = await getConversationById(id);
    if (!current) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }

    // Resposta humana só com handoff; se ainda estiver no bot, assume automaticamente.
    let conversation = current;
    if (conversation.handoffMode !== "human") {
      const by =
        typeof req.body?.by === "string" && req.body.by.trim()
          ? req.body.by.trim().slice(0, 80)
          : "Atendente";
      const updated = await setConversationHandoff(id, "human", by);
      if (!updated) {
        res.status(404).json({ error: "Conversa não encontrada." });
        return;
      }
      conversation = updated;
    }

    const phone = await customerPhoneFor(conversation.customerId);
    if (!phone) {
      res.status(400).json({ error: "Telefone do cliente não encontrado." });
      return;
    }

    await sendText(phone, text, { author: "agent", skipLog: true });
    const saved = await appendConversationMessage({
      conversationId: conversation.id,
      customerId: conversation.customerId,
      storeId: conversation.storeId,
      direction: "outbound",
      author: "agent",
      body: text,
      msgType: "text",
    });

    res.json({ conversation, message: saved });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao enviar mensagem.",
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
      // Usa state/context de antes do release (etapa em que o bot parou).
      await resumeAfterHumanHandoff({
        phone,
        customerId: current.customerId,
        state: current.state,
        context: current.context,
      });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao devolver ao bot.",
    });
  }
});

conversationsRouter.post("/:id/close", async (req, res) => {
  try {
    const id = String(req.params.id);
    const current = await getConversationById(id);
    if (!current) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }
    if (current.closedAt) {
      res.status(409).json({ error: "Esta conversa já está encerrada." });
      return;
    }

    const phone = await customerPhoneFor(current.customerId);
    if (phone) {
      await sendText(phone, AGENT_CLOSE_MESSAGE);
      await appendConversationMessage({
        conversationId: current.id,
        customerId: current.customerId,
        storeId: current.storeId,
        direction: "outbound",
        author: "bot",
        body: AGENT_CLOSE_MESSAGE,
      });
    }

    const updated = await closeConversationByAgent(id);
    if (!updated) {
      res.status(404).json({ error: "Conversa não encontrada." });
      return;
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao encerrar atendimento.",
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
