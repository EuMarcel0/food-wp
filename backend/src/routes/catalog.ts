import { Router } from "express";
import {
  createAddon,
  createCategory,
  createCrust,
  createNeighborhood,
  createProduct,
  createSize,
  deleteAddon,
  deleteCategory,
  deleteCrust,
  deleteNeighborhood,
  deleteSize,
  getStore,
  listAddons,
  listAddonsPage,
  listAllAddons,
  listAllCategories,
  listAllCrusts,
  listAllSizes,
  listCategories,
  listCategoriesPage,
  listCrusts,
  listCrustsPage,
  listProductsPage,
  listSizes,
  listSizesPage,
  saveStoreProfilePhoto,
  updateAddon,
  updateCategory,
  updateCrust,
  updateNeighborhood,
  updateProduct,
  updateSize,
  updateStore,
} from "../data/repository.js";
import {
  parseOptionalBoolean,
  parseOptionalText,
  parseSearch,
} from "../lib/filters.js";
import { parseBusinessHours } from "../lib/businessHours.js";
import { parsePageQuery } from "../lib/pagination.js";
import { updateWhatsAppBusinessProfile } from "../lib/whatsapp.js";
import type { PizzaKind, ProductOptionGroup, StorePatch } from "../types.js";

export const catalogRouter = Router();

function parsePizzaKind(raw: unknown): PizzaKind | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || raw === "") return null;
  const value = String(raw).trim().toLowerCase();
  if (value === "salgada" || value === "doce") return value;
  throw new Error("Informe se a pizza é doce ou salgada.");
}

function parseOptionGroups(raw: unknown): ProductOptionGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((item, index) => {
      const group = item as Record<string, unknown>;
      const options = Array.isArray(group.options) ? group.options : [];
      const minSelect = Math.max(0, Number(group.minSelect ?? 1));
      const maxSelect = Math.max(1, Number(group.maxSelect ?? 1));
      const priceMode: ProductOptionGroup["priceMode"] =
        group.priceMode === "replace" ? "replace" : "addon";
      const exclusiveSet = String(group.exclusiveSet ?? "").trim() || null;
      const name = String(group.name ?? "").trim() || `Tamanho ${index + 1}`;
      return {
        id: String(group.id ?? `group-${index}`),
        name,
        required: group.required !== false,
        minSelect: Math.min(minSelect, maxSelect),
        maxSelect,
        priceMode,
        exclusiveSet,
        price: Math.max(0, Number(group.price ?? 0)),
        sortOrder: Number(group.sortOrder ?? index),
        options: options
          .map((optionRaw, optionIndex) => {
            const option = optionRaw as Record<string, unknown>;
            return {
              id: String(option.id ?? `opt-${index}-${optionIndex}`),
              name: String(option.name ?? "").trim(),
              extraPrice: Math.max(0, Number(option.extraPrice ?? 0)),
              sortOrder: Number(option.sortOrder ?? optionIndex),
              active: option.active !== false,
            };
          })
          .filter((option) => option.name),
      };
    })
    .filter(
      (group) =>
        Boolean(group.exclusiveSet) ||
        group.options.length > 0 ||
        group.price > 0 ||
        Boolean(group.name.trim()),
    );
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

  if (body.businessHours !== undefined) {
    try {
      patch.businessHours = parseBusinessHours(body.businessHours);
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "Informe os horários de funcionamento.",
      });
      return;
    }
  }

  if (
    body.defaultAcceptMinutes !== undefined ||
    body.defaultPrepMinutes !== undefined
  ) {
    const defaultAcceptMinutes = Number(
      body.defaultAcceptMinutes ?? body.defaultPrepMinutes,
    );
    if (
      !Number.isFinite(defaultAcceptMinutes) ||
      defaultAcceptMinutes < 1 ||
      defaultAcceptMinutes > 480
    ) {
      res.status(400).json({
        error: "Informe o tempo estimado em minutos (1 a 480).",
      });
      return;
    }
    patch.defaultAcceptMinutes = Math.round(defaultAcceptMinutes);
  }

  if (body.autoAcceptOrders !== undefined) {
    patch.autoAcceptOrders = Boolean(body.autoAcceptOrders);
  }

  if (body.allowCustomerCancel !== undefined) {
    patch.allowCustomerCancel = Boolean(body.allowCustomerCancel);
  }

  if (patch.autoAcceptOrders === true) {
    const minutes =
      patch.defaultAcceptMinutes ??
      (await getStore()).defaultAcceptMinutes;
    if (!Number.isFinite(minutes) || minutes < 1) {
      res.status(400).json({
        error: "Cadastre o tempo estimado padrão para ativar o aceite automático.",
      });
      return;
    }
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

catalogRouter.patch("/store/neighborhoods/:id", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const feeCents = Number(req.body?.feeCents);
  if (!name || !Number.isFinite(feeCents) || feeCents < 0) {
    res.status(400).json({ error: "Informe o bairro e a taxa." });
    return;
  }
  try {
    res.json(
      await updateNeighborhood(String(req.params.id), {
        name,
        feeCents: Math.round(feeCents),
      }),
    );
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao atualizar o bairro.",
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

function crustPayload(body: Record<string, unknown>): {
  name: string;
  addsPrice: boolean;
  price: number;
  pizzaKind: "salgada" | "doce";
} | null {
  const name = String(body.name ?? "").trim();
  const addsPrice = Boolean(body.addsPrice);
  const price = addsPrice ? Number(body.price ?? 0) : 0;
  const pizzaKind =
    body.pizzaKind === "doce" || body.pizzaKind === "salgada"
      ? body.pizzaKind
      : null;
  if (!name || !pizzaKind || !Number.isFinite(price) || price < 0) {
    return null;
  }
  return {
    name,
    addsPrice,
    price: Math.round(price * 100) / 100,
    pizzaKind,
  };
}

catalogRouter.get("/crusts", async (req, res) => {
  const all = String(req.query.all ?? "") === "1";
  const paged =
    req.query.page !== undefined || req.query.limit !== undefined;
  if (paged) {
    const { page, limit } = parsePageQuery(req.query);
    res.json(
      await listCrustsPage(page, limit, all, {
        q: parseSearch(req.query.q),
        active: parseOptionalBoolean(req.query.active),
      }),
    );
    return;
  }
  res.json(all ? await listAllCrusts() : await listCrusts());
});

catalogRouter.post("/crusts", async (req, res) => {
  const payload = crustPayload(req.body ?? {});
  if (!payload) {
    res.status(400).json({
      error: "Preencha o nome da borda e informe se é doce ou salgada.",
    });
    return;
  }
  if (payload.addsPrice && payload.price < 0) {
    res.status(400).json({ error: "Informe um preço válido." });
    return;
  }
  try {
    res.status(201).json(await createCrust(payload));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao incluir borda.",
    });
  }
});

catalogRouter.patch("/crusts/:id", async (req, res) => {
  const payload = crustPayload(req.body ?? {});
  if (!payload) {
    res.status(400).json({
      error: "Preencha o nome da borda e informe se é doce ou salgada.",
    });
    return;
  }
  try {
    const crust = await updateCrust(String(req.params.id), payload);
    if (!crust) {
      res.status(404).json({ error: "Borda não encontrada." });
      return;
    }
    res.json(crust);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao atualizar borda.",
    });
  }
});

catalogRouter.delete("/crusts/:id", async (req, res) => {
  try {
    await deleteCrust(String(req.params.id));
    res.status(204).end();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao excluir borda.",
    });
  }
});

function sizePayload(body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const price = Number(body.price ?? 0);
  const maxSelect = Math.max(1, Math.min(10, Number(body.maxSelect ?? 1)));
  const priceMode: "addon" | "replace" =
    body.priceMode === "addon" ? "addon" : "replace";
  if (!name || !Number.isFinite(price) || price < 0) {
    return null;
  }
  return {
    name,
    price: Math.round(price * 100) / 100,
    maxSelect,
    priceMode,
  };
}

catalogRouter.get("/sizes", async (req, res) => {
  const all = String(req.query.all ?? "") === "1";
  const paged =
    req.query.page !== undefined || req.query.limit !== undefined;
  if (paged) {
    const { page, limit } = parsePageQuery(req.query);
    res.json(
      await listSizesPage(page, limit, all, {
        q: parseSearch(req.query.q),
        active: parseOptionalBoolean(req.query.active),
      }),
    );
    return;
  }
  res.json(all ? await listAllSizes() : await listSizes());
});

catalogRouter.post("/sizes", async (req, res) => {
  const payload = sizePayload(req.body ?? {});
  if (!payload) {
    res.status(400).json({ error: "Preencha o nome e o preço do tamanho." });
    return;
  }
  try {
    res.status(201).json(await createSize(payload));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao incluir tamanho.",
    });
  }
});

catalogRouter.patch("/sizes/:id", async (req, res) => {
  const payload = sizePayload(req.body ?? {});
  if (!payload) {
    res.status(400).json({ error: "Preencha o nome e o preço do tamanho." });
    return;
  }
  try {
    const size = await updateSize(String(req.params.id), payload);
    if (!size) {
      res.status(404).json({ error: "Tamanho não encontrado." });
      return;
    }
    res.json(size);
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "Falha ao atualizar tamanho.",
    });
  }
});

catalogRouter.delete("/sizes/:id", async (req, res) => {
  try {
    await deleteSize(String(req.params.id));
    res.status(204).end();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Falha ao excluir tamanho.",
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
  let pizzaKind: PizzaKind | null = null;
  try {
    pizzaKind = parsePizzaKind(req.body?.pizzaKind) ?? null;
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Informe se a pizza é doce ou salgada.",
    });
    return;
  }
  const notesEnabled = Boolean(req.body?.notesEnabled);
  const addonsEnabled = Boolean(req.body?.addonsEnabled);
  const crustsEnabled = Boolean(req.body?.crustsEnabled);
  const quantityEnabled = Boolean(req.body?.quantityEnabled);
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
  if (customizable && !pizzaKind) {
    res.status(400).json({
      error: "Informe se a pizza é doce ou salgada.",
    });
    return;
  }
  if (customizable && optionGroups.length === 0) {
    res.status(400).json({
      error: "Pizza precisa de pelo menos um tamanho.",
    });
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
        pizzaKind: customizable ? pizzaKind : null,
        notesEnabled,
        addonsEnabled,
        crustsEnabled,
        quantityEnabled,
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
    pizzaKind?: PizzaKind | null;
    notesEnabled?: boolean;
    addonsEnabled?: boolean;
    crustsEnabled?: boolean;
    quantityEnabled?: boolean;
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
  if (body.pizzaKind !== undefined) {
    patch.pizzaKind = parsePizzaKind(body.pizzaKind) ?? null;
  }
  if (body.notesEnabled !== undefined) {
    patch.notesEnabled = Boolean(body.notesEnabled);
  }
  if (body.addonsEnabled !== undefined) {
    patch.addonsEnabled = Boolean(body.addonsEnabled);
  }
  if (body.crustsEnabled !== undefined) {
    patch.crustsEnabled = Boolean(body.crustsEnabled);
  }
  if (body.quantityEnabled !== undefined) {
    patch.quantityEnabled = Boolean(body.quantityEnabled);
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
  let patch: ReturnType<typeof productPatch>;
  try {
    patch = productPatch(req.body ?? {});
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : "Informe se a pizza é doce ou salgada.",
    });
    return;
  }
  if (!patch || Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }
  if (patch.customizable === true && !patch.pizzaKind) {
    res.status(400).json({
      error: "Informe se a pizza é doce ou salgada.",
    });
    return;
  }
  if (patch.customizable && patch.optionGroups && patch.optionGroups.length === 0) {
    res.status(400).json({
      error: "Pizza precisa de pelo menos um tamanho.",
    });
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
