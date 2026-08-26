import { useCallback, useEffect, useRef, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Input, Select, Table, Tag } from "antd";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { ProductCard } from "./ProductCard";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/hooks";
import { toast } from "../../lib/toast";
import { formatReais } from "../../lib/format";
import {
  PAGE_SIZE,
  clampPage,
  serverPagination,
} from "../../lib/pagination";
import type { Category, Product } from "../../types";
import { ProductForm, toProductPayload } from "./ProductForm";
import type { ProductValues } from "../../lib/validation";

export function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [qInput, setQInput] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [active, setActive] = useState<boolean | undefined>();
  const q = useDebouncedValue(qInput.trim(), 300);
  const activeCount = [q, categoryId, active !== undefined].filter(Boolean).length;
  const filterKey = `${q}|${categoryId ?? ""}|${active ?? ""}`;
  const filterKeyRef = useRef(filterKey);

  const loadProducts = useCallback(async () => {
    const result = await api.products(page, limit, {
      q: q || undefined,
      categoryId,
      active,
    });
    const nextPage = clampPage(page, limit, result.total);
    setProducts(result.items);
    setTotal(result.total);
    if (nextPage !== page) setPage(nextPage);
  }, [page, limit, q, categoryId, active]);

  useEffect(() => {
    api
      .categories(true)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (filterKeyRef.current !== filterKey) {
      filterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    setLoading(true);
    loadProducts()
      .catch(() => {
        setProducts([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [filterKey, loadProducts, page]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setOpen(true);
  }

  async function handleSave(values: ProductValues) {
    setSaving(true);
    try {
      const payload = toProductPayload(values);
      if (editing) {
        await api.updateProduct(editing.id, payload);
        toast.success("Item atualizado.");
      } else {
        await api.createProduct(payload);
        toast.success("Item incluído no cardápio.");
      }
      setOpen(false);
      setEditing(null);
      await loadProducts();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    await api.updateProduct(product.id, { active: !product.active });
    toast.success(
      product.active ? "Item desativado no WhatsApp." : "Item ativado no WhatsApp.",
    );
    await loadProducts();
  }

  return (
    <>
      <PageHeader
        title="Cardápio"
        subtitle="Os itens ativos aparecem para o cliente no WhatsApp."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Incluir
          </Button>
        }
      />
      <ListFilters
        activeCount={activeCount}
        onClear={() => {
          setQInput("");
          setCategoryId(undefined);
          setActive(undefined);
        }}
      >
        <Input.Search
          className="filter-search"
          allowClear
          placeholder="Nome ou descrição"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
        />
        <Select
          className="filter-select"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Categoria"
          value={categoryId}
          onChange={setCategoryId}
          options={categories.map((category) => ({
            value: category.id,
            label: category.name,
          }))}
        />
        <Select
          className="filter-select"
          allowClear
          placeholder="Situação"
          value={active === undefined ? undefined : active ? "1" : "0"}
          onChange={(value) =>
            setActive(value === undefined ? undefined : value === "1")
          }
          options={[
            { value: "1", label: "Ativos" },
            { value: "0", label: "Inativos" },
          ]}
        />
      </ListFilters>
      <div className="table-wrap list-table">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={products}
          pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
            setPage(nextPage);
            setLimit(nextSize);
          })}
          scroll={{ x: 800 }}
          columns={[
            { title: "Categoria", dataIndex: "categoryName", width: 180 },
            { title: "Item", dataIndex: "name" },
            { title: "Descrição", dataIndex: "description" },
            {
              title: "Preço",
              dataIndex: "price",
              width: 120,
              render: (value: number) => formatReais(value),
            },
            {
              title: "Ativo",
              dataIndex: "active",
              width: 100,
              render: (value: boolean) => (
                <Tag color={value ? "green" : "default"}>
                  {value ? "Sim" : "Não"}
                </Tag>
              ),
            },
            {
              title: "Ações",
              width: 72,
              align: "center",
              render: (_, product) => (
                <RowActions
                  items={[
                    {
                      key: "edit",
                      label: "Editar",
                      onClick: () => openEdit(product),
                    },
                    {
                      key: "toggle",
                      label: product.active ? "Desativar" : "Ativar",
                      onClick: () => toggleActive(product),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
      <div className="list-cards">
        <MobileCardList
          loading={loading}
          isEmpty={products.length === 0}
          empty={
            activeCount > 0
              ? "Nenhum item encontrado com esses filtros."
              : "Nenhum item nesta página."
          }
          pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
            setPage(nextPage);
            setLimit(nextSize);
          })}
        >
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={openEdit}
              onToggle={toggleActive}
            />
          ))}
        </MobileCardList>
      </div>
      <ProductForm
        open={open}
        product={editing}
        categories={categories.filter(
          (category) => category.active || category.id === editing?.categoryId,
        )}
        submitting={saving}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSave}
      />
    </>
  );
}
