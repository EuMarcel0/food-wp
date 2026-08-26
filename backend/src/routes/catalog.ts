import { Router } from "express";
import {
  createCategory,
  createProduct,
  deleteCategory,
  getStore,
  listAllCategories,
  listCategories,
  listCategoriesPage,
  listProductsPage,
  updateCategory,
  updateProduct,
} from "../data/repository.js";
import {
  parseOptionalBoolean,
  parseOptionalText,
  parseSearch,
} from "../lib/filters.js";
import { parsePageQuery } from "../lib/pagination.js";
import type { ProductOptionGroup } from "../types.js";

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

  try {
    res.status(201).json(
      await createProduct({
        categoryId,
        name,
        description,
        price: Math.round(price * 100) / 100,
        active,
        customizable,
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
