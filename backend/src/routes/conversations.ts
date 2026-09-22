import { Router } from "express";
import { resumeAfterHumanHandoff } from "../conversation/engine.js";
import {
  appendConversationMessage,
  closeConversationByAgent,
  getConversationById,
  listConversationHistory,
  listConversationMessages,
  listLiveConversations,
  listOpenConversationsForClose,
  setConversationHandoff
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
      const rawLimit = Number(req.query.limit);
      const rawOffset = Number(req.query.offset);
      const limit = Number.isFinite(rawLimit) ? rawLimit : 30;
      const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
      res.json(await listConversationHistory({ limit, offset }));
      return;
    }
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 30;
    const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
    res.json(await listLiveConversations({ limit, offset }));
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao listar conversas."
    });
  }
});

conversationsRouter.post("/close-all", async (_req, res) => {
  try {
    const open = await listOpenConversationsForClose(200);
    let closed = 0;
    let failed = 0;
    for (const item of open) {
      try {
        if (item.phone) {
          await sendText(item.phone, AGENT_CLOSE_MESSAGE);
          await appendConversationMessage({
            conversationId: item.id,
            customerId: item.customerId,
            storeId: item.storeId,
            direction: "outbound",
            author: "bot",
            body: AGENT_CLOSE_MESSAGE
          });
        }
        const updated = await closeConversationByAgent(item.id);
        if (updated) closed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    res.json({ closed, failed, total: open.length });
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Falha ao encerrar todos os atendimentos."
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
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 40;
    const beforeAt = typeof req.query.beforeAt === "string" ? req.query.beforeAt : null;
    const beforeId = typeof req.query.beforeId === "string" ? req.query.beforeId : null;
    res.json(
      await listConversationMessages(id, {
        limit,
        beforeAt,
        beforeId
      })
    );
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao listar mensagens."
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
      const by = typeof req.body?.by === "string" && req.body.by.trim() ? req.body.by.trim().slice(0, 80) : "Atendente";
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
      msgType: "text"
    });

    res.json({ conversation, message: saved });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao enviar mensagem."
    });
  }
});

conversationsRouter.post("/:id/takeover", async (req, res) => {
  try {
    const id = String(req.params.id);
    const by = typeof req.body?.by === "string" && req.body.by.trim() ? req.body.by.trim().slice(0, 80) : null;

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
      await sendText(phone, "Um atendente vai continuar este atendimento por aqui. Pode falar normalmente.");
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao assumir conversa."
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
        context: current.context
      });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao devolver ao bot."
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
        body: AGENT_CLOSE_MESSAGE
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
      error: error instanceof Error ? error.message : "Falha ao encerrar atendimento."
    });
  }
});

async function customerPhoneFor(customerId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return memoryStore.findCustomerPhone(customerId);
  }
  const { data } = await supabase.from("customers").select("wa_phone").eq("id", customerId).maybeSingle();
  return data?.wa_phone ? String(data.wa_phone) : null;
}
