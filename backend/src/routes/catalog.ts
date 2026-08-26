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

export const catalogRouter = Router();

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
  const price = Number(req.body?.price);
  const active = req.body?.active !== false;

  if (!name || !categoryId || !Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: "Preencha nome, categoria e preço." });
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

  return patch;
}

catalogRouter.patch("/products/:id", async (req, res) => {
  const patch = productPatch(req.body ?? {});
  if (!patch || Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
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
