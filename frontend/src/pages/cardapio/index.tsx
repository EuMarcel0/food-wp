import { useEffect, useState, type Key } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Input, Select, Table, Tag } from "antd";
import { FillTable } from "../../components/FillTable";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { useDialog } from "../../dialog";
import { ProductCard } from "./ProductCard";
import { api } from "../../lib/api";
import { useDebouncedValue, useMediaQuery } from "../../lib/hooks";
import { toast } from "../../lib/toast";
import { catalogPriceLabel } from "../../lib/format";
import { PAGE_SIZE, clampPage, serverPagination } from "../../lib/pagination";
import { queryKeys } from "../../lib/queryKeys";
import { useTableGridHeight } from "../../lib/useTableGridHeight";
import type { Product } from "../../types";
import { ProductForm, toProductPayload } from "./ProductForm";
import type { ProductValues } from "../../lib/validation";
import { filterSearch, filterSelect, listCards, listPage, tableClass, tableGridFill } from "../../ui";

export function CatalogPage() {
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const { shellRef, tableAreaRef, bodyHeight } = useTableGridHeight(isDesktop);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [qInput, setQInput] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [active, setActive] = useState<boolean | undefined>();
  const q = useDebouncedValue(qInput.trim(), 300);
  const filters = { q: q || undefined, categoryId, active };
  const activeCount = [q, categoryId, active !== undefined].filter(Boolean).length;

  useEffect(() => {
    setPage(1);
    setSelectedKeys([]);
  }, [q, categoryId, active]);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.options,
    queryFn: () => api.categories(true),
  });
  const categories = categoriesQuery.data ?? [];

  const addonsQuery = useQuery({
    queryKey: queryKeys.addons.options,
    queryFn: () => api.addons(true),
  });
  const addons = addonsQuery.data ?? [];

  const listQuery = useQuery({
    queryKey: queryKeys.products.list(page, limit, filters),
    queryFn: () => api.products(page, limit, filters),
    placeholderData: keepPreviousData,
  });

  const result = listQuery.data;
  const products = result?.items ?? [];
  const total = result?.total ?? 0;
  const selectedProducts = products.filter((product) =>
    selectedKeys.includes(product.id),
  );

  useEffect(() => {
    if (!result) return;
    const nextPage = clampPage(page, limit, result.total);
    if (nextPage !== page) setPage(nextPage);
  }, [limit, page, result]);

  useEffect(() => {
    const ids = new Set(products.map((product) => product.id));
    setSelectedKeys((keys) => {
      const next = keys.filter((key) => ids.has(String(key)));
      return next.length === keys.length ? keys : next;
    });
  }, [products]);

  async function refreshCatalog() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.addons.all }),
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async (values: ProductValues) => {
      const payload = toProductPayload(values);
      if (editing) return api.updateProduct(editing.id, payload);
      return api.createProduct(payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "Item atualizado." : "Item incluído no cardápio.");
      setOpen(false);
      setEditing(null);
      await refreshCatalog();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (product: Product) =>
      api.updateProduct(product.id, { active: !product.active }),
    onSuccess: async (_updated, product) => {
      toast.success(
        product.active
          ? "Item desativado no WhatsApp."
          : "Item ativado no WhatsApp.",
      );
      await refreshCatalog();
    },
  });

  const bulkActiveMutation = useMutation({
    mutationFn: async ({
      ids,
      active: nextActive,
    }: {
      ids: string[];
      active: boolean;
    }) => {
      await Promise.all(
        ids.map((id) => api.updateProduct(id, { active: nextActive })),
      );
    },
    onSuccess: async (_data, variables) => {
      const count = variables.ids.length;
      toast.success(
        variables.active
          ? count === 1
            ? "1 item ativado no WhatsApp."
            : `${count} itens ativados no WhatsApp.`
          : count === 1
            ? "1 item desativado no WhatsApp."
            : `${count} itens desativados no WhatsApp.`,
      );
      setSelectedKeys([]);
      await refreshCatalog();
    },
  });

  function askBulkActive(nextActive: boolean) {
    const ids = selectedProducts.map((product) => product.id);
    if (!ids.length) return;
    const count = ids.length;
    void dialog.confirm({
      title: nextActive ? "Ativar itens" : "Desativar itens",
      description: nextActive ? (
        <>
          Ativar <strong>{count}</strong>{" "}
          {count === 1 ? "item selecionado" : "itens selecionados"}? Eles voltam
          a aparecer no WhatsApp.
        </>
      ) : (
        <>
          Desativar <strong>{count}</strong>{" "}
          {count === 1 ? "item selecionado" : "itens selecionados"}? Eles deixam
          de aparecer no WhatsApp.
        </>
      ),
      okText: nextActive ? "Ativar" : "Desativar",
      onConfirm: () =>
        bulkActiveMutation.mutateAsync({ ids, active: nextActive }),
    });
  }

  const bulkTrailing =
    selectedKeys.length > 0 ? (
      <>
        <Button
          loading={bulkActiveMutation.isPending}
          onClick={() => askBulkActive(true)}
        >
          Ativar ({selectedKeys.length})
        </Button>
        <Button
          danger
          loading={bulkActiveMutation.isPending}
          onClick={() => askBulkActive(false)}
        >
          Desativar ({selectedKeys.length})
        </Button>
      </>
    ) : null;

  return (
    <div className={listPage}>
      <PageHeader
        className="mb-3 shrink-0"
        kicker="Itens"
        title="Cardápio"
        subtitle="Os itens ativos aparecem para o cliente no WhatsApp."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Incluir
          </Button>
        }
      />
      <ListFilters
        className="mb-3 shrink-0"
        activeCount={activeCount}
        trailing={bulkTrailing}
        onClear={() => {
          setQInput("");
          setCategoryId(undefined);
          setActive(undefined);
        }}
      >
        <Input.Search
          className={filterSearch}
          allowClear
          placeholder="Nome ou descrição…"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
        />
        <Select
          className={filterSelect}
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
          className={filterSelect}
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
      <FillTable
        shellRef={shellRef}
        tableAreaRef={tableAreaRef}
        pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
          setPage(nextPage);
          setLimit(nextSize);
          setSelectedKeys([]);
        })}
      >
        <Table
          rowKey="id"
          className={`${tableClass} ${tableGridFill}`}
          loading={listQuery.isPending && !result}
          dataSource={products}
          pagination={false}
          scroll={{ x: 800, y: bodyHeight }}
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: setSelectedKeys,
          }}
          columns={[
            { title: "Categoria", dataIndex: "categoryName", width: 180 },
            { title: "Item", dataIndex: "name" },
            {
              title: "Tipo",
              width: 240,
              render: (_, product) => (
                <>
                  {product.customizable ? (
                    <Tag color="orange">
                      {product.pizzaKind === "doce"
                        ? "Pizza doce"
                        : product.pizzaKind === "salgada"
                          ? "Pizza salgada"
                          : "Pizza"}
                    </Tag>
                  ) : (
                    <Tag>Simples</Tag>
                  )}
                  {product.notesEnabled ? <Tag color="blue">Observação</Tag> : null}
                  {product.addonsEnabled ? <Tag color="purple">Adicional</Tag> : null}
                  {product.crustsEnabled ? <Tag color="gold">Borda</Tag> : null}
                  {product.quantityEnabled ? <Tag color="cyan">Qtd.</Tag> : null}
                </>
              ),
            },
            { title: "Descrição", dataIndex: "description" },
            {
              title: "Preço",
              dataIndex: "price",
              width: 120,
              render: (_, product) => catalogPriceLabel(product),
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
                      onClick: () => {
                        setEditing(product);
                        setOpen(true);
                      },
                    },
                    {
                      key: "toggle",
                      label: product.active ? "Desativar" : "Ativar",
                      onClick: () => toggleMutation.mutate(product),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </FillTable>
      <div className={listCards}>
        <MobileCardList
          loading={listQuery.isPending && !result}
          isEmpty={products.length === 0}
          empty={
            activeCount > 0
              ? "Nenhum item encontrado com esses filtros."
              : "Inclua o primeiro item do cardápio."
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
              onEdit={(item) => {
                setEditing(item);
                setOpen(true);
              }}
              onToggle={(item) => toggleMutation.mutate(item)}
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
        addons={addons}
        submitting={saveMutation.isPending}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSubmit={async (values) => {
          await saveMutation.mutateAsync(values);
        }}
      />
    </div>
  );
}
