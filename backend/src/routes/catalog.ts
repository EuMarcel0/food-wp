import { Router } from "express";
import {
  createAddon,
  createCategory,
  createNeighborhood,
  createProduct,
  deleteAddon,
  deleteCategory,
  deleteNeighborhood,
  getStore,
  listAddons,
  listAddonsPage,
  listAllAddons,
  listAllCategories,
  listCategories,
  listCategoriesPage,
  listProductsPage,
  saveStoreProfilePhoto,
  updateAddon,
  updateCategory,
  updateProduct,
  updateStore,
} from "../data/repository.js";
import {
  parseOptionalBoolean,
  parseOptionalText,
  parseSearch,
} from "../lib/filters.js";
import { parsePageQuery } from "../lib/pagination.js";
import { updateWhatsAppBusinessProfile } from "../lib/whatsapp.js";
import type { ProductOptionGroup, StorePatch } from "../types.js";

export const catalogRouter = Router();

function parseOptionGroups(raw: unknown): ProductOptionGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((item, index) => {
    const group = item as Record<string, unknown>;
    const options = Array.isArray(group.options) ? group.options : [];
    const minSelect = Math.max(0, Number(group.minSelect ?? 1));
    const maxSelect = Math.max(1, Number(group.maxSelect ?? 1));
    const priceMode: ProductOptionGroup["priceMode"] =
      group.priceMode === "replace" ? "replace" : "addon";
    return {
      id: String(group.id ?? `group-${index}`),
      name: String(group.name ?? "").trim() || `Opção ${index + 1}`,
      required: group.required !== false,
      minSelect: Math.min(minSelect, maxSelect),
      maxSelect,
      priceMode,
      exclusiveSet: String(group.exclusiveSet ?? "").trim() || null,
      price: Math.max(0, Number(group.price ?? 0)),
      sortOrder: Number(group.sortOrder ?? index),
      options: options.map((optionRaw, optionIndex) => {
        const option = optionRaw as Record<string, unknown>;
        return {
          id: String(option.id ?? `opt-${index}-${optionIndex}`),
          name: String(option.name ?? "").trim(),
          extraPrice: Math.max(0, Number(option.extraPrice ?? 0)),
          sortOrder: Number(option.sortOrder ?? optionIndex),
          active: option.active !== false,
        };
      }).filter((option) => option.name),
    };
  }).filter((group) => group.options.length > 0);
}

function categoryPayload(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const sortOrder = Number(body.sortOrder ?? 0);
  const active = body.active !== false;
  if (!name || !Number.isInteger(sortOrder) || sortOrder < 0) {
    return null;
  }
  return { name, sortOrder, active };
}

catalogRouter.get("/store", async (_req, res) => {
  res.json(await getStore());
});

catalogRouter.patch("/store", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: StorePatch = {};

  if (body.idleTimeoutMinutes !== undefined) {
    const idleTimeoutMinutes = Number(body.idleTimeoutMinutes);
    if (!Number.isFinite(idleTimeoutMinutes) || idleTimeoutMinutes < 1 || idleTimeoutMinutes > 10080) {
      res.status(400).json({
        error: "Informe o tempo limite em minutos (1 a 10080).",
      });
      return;
    }
    patch.idleTimeoutMinutes = idleTimeoutMinutes;
  }

  if (body.deliveryFeeCents !== undefined) {
    const deliveryFeeCents = Number(body.deliveryFeeCents);
    if (!Number.isFinite(deliveryFeeCents) || deliveryFeeCents < 0) {
      res.status(400).json({ error: "Informe uma taxa default válida." });
      return;
    }
    patch.deliveryFeeCents = Math.round(deliveryFeeCents);
  }

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: "Informe o nome do estabelecimento (2 a 80 caracteres)." });
      return;
    }
    patch.name = name;
  }

  if (body.legalName !== undefined) {
    const legalName = String(body.legalName ?? "").trim();
    if (legalName.length > 120) {
      res.status(400).json({ error: "A razão social pode ter no máximo 120 caracteres." });
      return;
    }
    patch.legalName = legalName || null;
  }

  if (body.cnpj !== undefined) {
    const cnpj = String(body.cnpj ?? "").replace(/\D/g, "");
    if (cnpj && cnpj.length !== 14) {
      res.status(400).json({ error: "Informe um CNPJ com 14 dígitos." });
      return;
    }
    patch.cnpj = cnpj || null;
  }

  if (body.receiptFooter !== undefined) {
    const receiptFooter = String(body.receiptFooter ?? "").trim().slice(0, 240);
    patch.receiptFooter = receiptFooter || null;
  }

  const photo = body.photo as { mime?: string; data?: string } | undefined;
  let picture: { bytes: Buffer; mime: string; fileName: string } | undefined;
  if (photo?.data) {
    const raw = String(photo.data).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length < 32 || bytes.length > 2.5 * 1024 * 1024) {
      res.status(400).json({ error: "A foto precisa ter no máximo 2 MB." });
      return;
    }
    try {
      const store = await getStore();
      patch.profilePhotoUrl = await saveStoreProfilePhoto(store.id, bytes);
      picture = { bytes, mime: "image/jpeg", fileName: "profile.jpg" };
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "Falha ao salvar a foto.",
      });
      return;
    }
  }

  if (!Object.keys(patch).length) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }

  try {
    const store = await updateStore(patch);
    let whatsappError: string | undefined;
    if (patch.name || picture) {
      try {
        await updateWhatsAppBusinessProfile({
          about: store.name,
          picture,
        });
      } catch (error) {
        whatsappError =
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar o perfil no WhatsApp.";
      }
    }
    res.json({ ...store, whatsappError });
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Falha ao salvar as configurações.",
    });
  }
});

catalogRouter.post("/store/neighborhoods", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const feeCents = Number(req.body?.feeCents);
  if (!name || !Number.isFinite(feeCents) || feeCents < 0) {
    res.status(400).json({ error: "Informe o bairro e a taxa." });
    return;
  }
  try {
    res.status(201).json(
      await createNeighborhood({ name, feeCents: Math.round(feeCents) }),
    );
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao incluir o bairro.",
    });
  }
});

catalogRouter.delete("/store/neighborhoods/:id", async (req, res) => {
  try {
    await deleteNeighborhood(String(req.params.id));
    res.status(204).end();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao excluir o bairro.",
    });
  }
});

catalogRouter.get("/categories", async (req, res) => {
  const all = String(req.query.all ?? "") === "1";
  const paged =
    req.query.page !== undefined || req.query.limit !== undefined;
  if (paged) {
    const { page, limit } = parsePageQuery(req.query);
    res.json(
      await listCategoriesPage(page, limit, all, {
        q: parseSearch(req.query.q),
        active: parseOptionalBoolean(req.query.active),
      }),
    );
    return;
  }
  res.json(all ? await listAllCategories() : await listCategories());
});

catalogRouter.post("/categories", async (req, res) => {
  const payload = categoryPayload(req.body ?? {});
  if (!payload) {
    res.status(400).json({ error: "Preencha o nome e a ordem." });
    return;
  }
  try {
    res.status(201).json(await createCategory(payload));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao incluir categoria.",
    });
  }
});

catalogRouter.patch("/categories/:id", async (req, res) => {
  const payload = categoryPayload(req.body ?? {});
  if (!payload) {
    res.status(400).json({ error: "Preencha o nome e a ordem." });
    return;
  }
  try {
    const category = await updateCategory(String(req.params.id), payload);
    if (!category) {
      res.status(404).json({ error: "Categoria não encontrada." });
      return;
    }
    res.json(category);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao atualizar categoria.",
    });
  }
});

catalogRouter.delete("/categories/:id", async (req, res) => {
  try {
    await deleteCategory(String(req.params.id));
    res.status(204).end();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao excluir categoria.",
    });
  }
});

function addonPayload(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const price = Number(body.price ?? 0);
  const sortOrder = Number(body.sortOrder ?? 0);
  const active = body.active !== false;
  if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(sortOrder) || sortOrder < 0) {
    return null;
  }
  return { name, price: Math.round(price * 100) / 100, sortOrder, active };
}

function parseAddonIds(raw: unknown) {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((value) => String(value)).filter(Boolean);
}

catalogRouter.get("/addons", async (req, res) => {
  const all = String(req.query.all ?? "") === "1";
  const paged =
    req.query.page !== undefined || req.query.limit !== undefined;
  if (paged) {
    const { page, limit } = parsePageQuery(req.query);
    res.json(
      await listAddonsPage(page, limit, all, {
        q: parseSearch(req.query.q),
        active: parseOptionalBoolean(req.query.active),
      }),
    );
    return;
  }
  res.json(all ? await listAllAddons() : await listAddons());
});

catalogRouter.post("/addons", async (req, res) => {
  const payload = addonPayload(req.body ?? {});
  if (!payload) {
    res.status(400).json({ error: "Preencha o nome e o valor." });
    return;
  }
  try {
    res.status(201).json(await createAddon(payload));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao incluir adicional.",
    });
  }
});

catalogRouter.patch("/addons/:id", async (req, res) => {
  const payload = addonPayload(req.body ?? {});
  if (!payload) {
    res.status(400).json({ error: "Preencha o nome e o valor." });
    return;
  }
  try {
    const addon = await updateAddon(String(req.params.id), payload);
    if (!addon) {
      res.status(404).json({ error: "Adicional não encontrado." });
      return;
    }
    res.json(addon);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao atualizar adicional.",
    });
  }
});

catalogRouter.delete("/addons/:id", async (req, res) => {
  try {
    await deleteAddon(String(req.params.id));
    res.status(204).end();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao excluir adicional.",
    });
  }
});

catalogRouter.get("/products", async (req, res) => {
  const { page, limit } = parsePageQuery(req.query);
  res.json(
    await listProductsPage(page, limit, {
      q: parseSearch(req.query.q),
      categoryId: parseOptionalText(req.query.categoryId),
      active: parseOptionalBoolean(req.query.active),
    }),
  );
});

catalogRouter.post("/products", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const categoryId = String(req.body?.categoryId ?? "").trim();
  const description = String(req.body?.description ?? "").trim() || null;
  const rawPrice = req.body?.price;
  const price =
    rawPrice === undefined || rawPrice === null || rawPrice === ""
      ? 0
      : Number(rawPrice);
  const active = req.body?.active !== false;
  const customizable = Boolean(req.body?.customizable);
  const notesEnabled = Boolean(req.body?.notesEnabled);
  const addonsEnabled = Boolean(req.body?.addonsEnabled);
  const addonIds = parseAddonIds(req.body?.addonIds) ?? [];
  const optionGroups = parseOptionGroups(req.body?.optionGroups) ?? [];

  if (!name || !categoryId || !Number.isFinite(price) || price < 0) {
    res.status(400).json({
      error: customizable
        ? "Preencha nome e categoria."
        : "Preencha nome, categoria e preço.",
    });
    return;
  }
  if (customizable && optionGroups.length === 0) {
    res.status(400).json({
      error: "Item montável precisa de pelo menos um grupo de opções.",
    });
    return;
  }

  if (addonsEnabled && addonIds.length === 0) {
    res.status(400).json({ error: "Escolha pelo menos um adicional para este item." });
    return;
  }

  try {
    res.status(201).json(
      await createProduct({
        categoryId,
        name,
        description,
        price: Math.round(price * 100) / 100,
        active,
        customizable,
        notesEnabled,
        addonsEnabled,
        addonIds: addonsEnabled ? addonIds : [],
        optionGroups,
      }),
    );
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao incluir item.",
    });
  }
});

function productPatch(body: Record<string, unknown>) {
  const patch: {
    categoryId?: string;
    name?: string;
    description?: string | null;
    price?: number;
    active?: boolean;
    customizable?: boolean;
    notesEnabled?: boolean;
    addonsEnabled?: boolean;
    addonIds?: string[];
    optionGroups?: ProductOptionGroup[];
  } = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return null;
    patch.name = name;
  }
  if (body.categoryId !== undefined) {
    const categoryId = String(body.categoryId).trim();
    if (!categoryId) return null;
    patch.categoryId = categoryId;
  }
  if (body.description !== undefined) {
    patch.description = String(body.description).trim() || null;
  }
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price < 0) return null;
    patch.price = Math.round(price * 100) / 100;
  }
  if (body.active !== undefined) {
    patch.active = Boolean(body.active);
  }
  if (body.customizable !== undefined) {
    patch.customizable = Boolean(body.customizable);
  }
  if (body.notesEnabled !== undefined) {
    patch.notesEnabled = Boolean(body.notesEnabled);
  }
  if (body.addonsEnabled !== undefined) {
    patch.addonsEnabled = Boolean(body.addonsEnabled);
  }
  if (body.addonIds !== undefined) {
    patch.addonIds = parseAddonIds(body.addonIds) ?? [];
  }
  if (body.optionGroups !== undefined) {
    patch.optionGroups = parseOptionGroups(body.optionGroups) ?? [];
  }

  return patch;
}

catalogRouter.patch("/products/:id", async (req, res) => {
  const patch = productPatch(req.body ?? {});
  if (!patch || Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }
  if (patch.customizable && patch.optionGroups && patch.optionGroups.length === 0) {
    res.status(400).json({
      error: "Item montável precisa de pelo menos um grupo de opções.",
    });
    return;
  }
  if (patch.addonsEnabled && patch.addonIds && patch.addonIds.length === 0) {
    res.status(400).json({ error: "Escolha pelo menos um adicional para este item." });
    return;
  }
  try {
    const product = await updateProduct(String(req.params.id), patch);
    if (!product) {
      res.status(404).json({ error: "Item não encontrado." });
      return;
    }
    res.json(product);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao atualizar item.",
    });
  }
});
