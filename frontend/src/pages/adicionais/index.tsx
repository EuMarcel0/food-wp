import { useEffect, useState, type Key } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Input, Select, Table, Tabs, Tag } from "antd";
import { FillTable } from "../../components/FillTable";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { useDialog } from "../../dialog";
import { AddonCard } from "./AddonCard";
import { CrustCard } from "./CrustCard";
import { SizeCard } from "./SizeCard";
import { api } from "../../lib/api";
import { useDebouncedValue, useMediaQuery } from "../../lib/hooks";
import { toast } from "../../lib/toast";
import { formatReais } from "../../lib/format";
import { PAGE_SIZE, clampPage, serverPagination } from "../../lib/pagination";
import { queryKeys } from "../../lib/queryKeys";
import { useTableGridHeight } from "../../lib/useTableGridHeight";
import type { Addon, Crust, Size } from "../../types";
import type { AddonValues, CrustValues, SizeValues } from "../../lib/validation";
import { AddonForm, toAddonPayload } from "./AddonForm";
import { CrustForm, toCrustPayload } from "./CrustForm";
import { SizeForm, toSizePayload } from "./SizeForm";
import { filterSearch, filterSelect, listCards, listPage, tableClass, tableGridFill } from "../../ui";

type TabKey = "addons" | "crusts" | "sizes";

export function AddonsPage() {
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 992px)");
  const [tab, setTab] = useState<TabKey>("addons");
  const { shellRef, tableAreaRef, bodyHeight } = useTableGridHeight(isDesktop, tab);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [editingCrust, setEditingCrust] = useState<Crust | null>(null);
  const [editingSize, setEditingSize] = useState<Size | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [qInput, setQInput] = useState("");
  const [active, setActive] = useState<boolean | undefined>();
  const q = useDebouncedValue(qInput.trim(), 300);
  const addonFilters = { q: q || undefined, active };
  const crustFilters = { q: q || undefined };
  const sizeFilters = { q: q || undefined };
  const addonFilterCount = [q, active !== undefined].filter(Boolean).length;
  const crustFilterCount = q ? 1 : 0;
  const sizeFilterCount = q ? 1 : 0;
  const isCrusts = tab === "crusts";
  const isSizes = tab === "sizes";
  const isAddons = tab === "addons";

  useEffect(() => {
    setPage(1);
    setSelectedKeys([]);
  }, [q, active, tab]);

  const addonsQuery = useQuery({
    queryKey: queryKeys.addons.list(page, limit, addonFilters),
    queryFn: () => api.listAddons(page, limit, addonFilters),
    placeholderData: keepPreviousData,
    enabled: isAddons,
  });

  const crustsQuery = useQuery({
    queryKey: queryKeys.crusts.list(page, limit, crustFilters),
    queryFn: () => api.listCrusts(page, limit, crustFilters),
    placeholderData: keepPreviousData,
    enabled: isCrusts,
  });

  const sizesQuery = useQuery({
    queryKey: queryKeys.sizes.list(page, limit, sizeFilters),
    queryFn: () => api.listSizes(page, limit, sizeFilters),
    placeholderData: keepPreviousData,
    enabled: isSizes,
  });

  const listQuery = isSizes ? sizesQuery : isCrusts ? crustsQuery : addonsQuery;
  const result = listQuery.data;
  const addons = addonsQuery.data?.items ?? [];
  const crusts = crustsQuery.data?.items ?? [];
  const sizes = sizesQuery.data?.items ?? [];
  const total = result?.total ?? 0;

  useEffect(() => {
    if (!result) return;
    const nextPage = clampPage(page, limit, result.total);
    if (nextPage !== page) setPage(nextPage);
  }, [limit, page, result]);

  useEffect(() => {
    const items = isSizes ? sizes : isCrusts ? crusts : addons;
    const ids = new Set(items.map((item) => item.id));
    setSelectedKeys((keys) => {
      const next = keys.filter((key) => ids.has(String(key)));
      return next.length === keys.length ? keys : next;
    });
  }, [isCrusts, isSizes, addons, crusts, sizes]);

  async function refreshAddons() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.addons.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
    ]);
  }

  async function refreshCrusts() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.crusts.all });
  }

  async function refreshSizes() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.sizes.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
    ]);
  }

  const saveAddonMutation = useMutation({
    mutationFn: async (values: AddonValues) => {
      const payload = toAddonPayload(values);
      if (editingAddon) return api.updateAddon(editingAddon.id, payload);
      return api.createAddon(payload);
    },
    onSuccess: async () => {
      toast.success(editingAddon ? "Adicional atualizado." : "Adicional incluído.");
      setOpen(false);
      setEditingAddon(null);
      await refreshAddons();
    },
  });

  const deleteAddonMutation = useMutation({
    mutationFn: (addon: Addon) => api.deleteAddon(addon.id),
    onSuccess: async (_data, addon) => {
      toast.success("Adicional excluído.");
      setSelectedKeys((keys) =>
        keys.filter((key) => String(key) !== addon.id),
      );
      await refreshAddons();
    },
  });

  const bulkDeleteAddonMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.deleteAddon(id)));
    },
    onSuccess: async (_data, ids) => {
      toast.success(
        ids.length === 1
          ? "Adicional excluído."
          : `${ids.length} adicionais excluídos.`,
      );
      setSelectedKeys([]);
      await refreshAddons();
    },
  });

  const saveCrustMutation = useMutation({
    mutationFn: async (values: CrustValues) => {
      const payload = toCrustPayload(values);
      if (editingCrust) return api.updateCrust(editingCrust.id, payload);
      return api.createCrust(payload);
    },
    onSuccess: async () => {
      toast.success(editingCrust ? "Borda atualizada." : "Borda incluída.");
      setOpen(false);
      setEditingCrust(null);
      await refreshCrusts();
    },
  });

  const deleteCrustMutation = useMutation({
    mutationFn: (crust: Crust) => api.deleteCrust(crust.id),
    onSuccess: async (_data, crust) => {
      toast.success("Borda excluída.");
      setSelectedKeys((keys) =>
        keys.filter((key) => String(key) !== crust.id),
      );
      await refreshCrusts();
    },
  });

  const bulkDeleteCrustMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.deleteCrust(id)));
    },
    onSuccess: async (_data, ids) => {
      toast.success(
        ids.length === 1
          ? "Borda excluída."
          : `${ids.length} bordas excluídas.`,
      );
      setSelectedKeys([]);
      await refreshCrusts();
    },
  });

  const saveSizeMutation = useMutation({
    mutationFn: async (values: SizeValues) => {
      const payload = toSizePayload(values);
      if (editingSize) return api.updateSize(editingSize.id, payload);
      return api.createSize(payload);
    },
    onSuccess: async () => {
      toast.success(editingSize ? "Tamanho atualizado." : "Tamanho incluído.");
      setOpen(false);
      setEditingSize(null);
      await refreshSizes();
    },
  });

  const deleteSizeMutation = useMutation({
    mutationFn: (size: Size) => api.deleteSize(size.id),
    onSuccess: async (_data, size) => {
      toast.success("Tamanho excluído.");
      setSelectedKeys((keys) =>
        keys.filter((key) => String(key) !== size.id),
      );
      await refreshSizes();
    },
  });

  const bulkDeleteSizeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => api.deleteSize(id)));
    },
    onSuccess: async (_data, ids) => {
      toast.success(
        ids.length === 1
          ? "Tamanho excluído."
          : `${ids.length} tamanhos excluídos.`,
      );
      setSelectedKeys([]);
      await refreshSizes();
    },
  });

  function askDeleteAddon(addon: Addon) {
    void dialog.delete({
      title: "Excluir adicional",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{addon.name}</strong>? Os itens
          do cardápio que usam este adicional deixam de oferecê-lo.
        </>
      ),
      onConfirm: () => deleteAddonMutation.mutateAsync(addon),
    });
  }

  function askDeleteCrust(crust: Crust) {
    void dialog.delete({
      title: "Excluir borda",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{crust.name}</strong>? Itens
          com “Perguntar borda” deixam de oferecer esta opção.
        </>
      ),
      onConfirm: () => deleteCrustMutation.mutateAsync(crust),
    });
  }

  function askDeleteSize(size: Size) {
    void dialog.delete({
      title: "Excluir tamanho",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{size.name}</strong>? Pizzas
          que usam este tamanho deixam de oferecê-lo até você marcar outro.
        </>
      ),
      onConfirm: () => deleteSizeMutation.mutateAsync(size),
    });
  }

  function askBulkDeleteAddon() {
    const ids = selectedKeys.map(String);
    if (!ids.length) return;
    const count = ids.length;
    void dialog.delete({
      title: "Excluir adicionais",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{count}</strong>{" "}
          {count === 1 ? "adicional selecionado" : "adicionais selecionados"}?
          Os itens do cardápio que usam esses adicionais deixam de oferecê-los.
        </>
      ),
      onConfirm: () => bulkDeleteAddonMutation.mutateAsync(ids),
    });
  }

  function askBulkDeleteCrust() {
    const ids = selectedKeys.map(String);
    if (!ids.length) return;
    const count = ids.length;
    void dialog.delete({
      title: "Excluir bordas",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{count}</strong>{" "}
          {count === 1 ? "borda selecionada" : "bordas selecionadas"}? Itens com
          “Perguntar borda” deixam de oferecer essas opções.
        </>
      ),
      onConfirm: () => bulkDeleteCrustMutation.mutateAsync(ids),
    });
  }

  function askBulkDeleteSize() {
    const ids = selectedKeys.map(String);
    if (!ids.length) return;
    const count = ids.length;
    void dialog.delete({
      title: "Excluir tamanhos",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{count}</strong>{" "}
          {count === 1 ? "tamanho selecionado" : "tamanhos selecionados"}?
        </>
      ),
      onConfirm: () => bulkDeleteSizeMutation.mutateAsync(ids),
    });
  }

  const bulkTrailing =
    selectedKeys.length > 0 ? (
      <Button
        danger
        loading={
          isSizes
            ? bulkDeleteSizeMutation.isPending
            : isCrusts
              ? bulkDeleteCrustMutation.isPending
              : bulkDeleteAddonMutation.isPending
        }
        onClick={
          isSizes
            ? askBulkDeleteSize
            : isCrusts
              ? askBulkDeleteCrust
              : askBulkDeleteAddon
        }
      >
        Excluir ({selectedKeys.length})
      </Button>
    ) : null;

  function openCreate() {
    setEditingAddon(null);
    setEditingCrust(null);
    setEditingSize(null);
    setOpen(true);
  }

  return (
    <div className={listPage}>
      <PageHeader
        className="mb-3 shrink-0"
        kicker="Extras"
        title="Adicionais"
        subtitle="Cadastre extras, bordas e tamanhos. Na pizza, marque os tamanhos e se o bot deve perguntar a borda."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Incluir
          </Button>
        }
      />
      <Tabs
        className="mb-0 shrink-0 [&_.ant-tabs-nav]:mb-3"
        activeKey={tab}
        onChange={(key) => {
          setTab(key as TabKey);
          setQInput("");
          setActive(undefined);
          setOpen(false);
          setEditingAddon(null);
          setEditingCrust(null);
          setEditingSize(null);
          setSelectedKeys([]);
        }}
        items={[
          { key: "addons", label: "Adicional" },
          { key: "crusts", label: "Bordas" },
          { key: "sizes", label: "Tamanhos" },
        ]}
      />
      {isSizes ? (
        <ListFilters
          className="mb-3 shrink-0"
          activeCount={sizeFilterCount}
          trailing={bulkTrailing}
          onClear={() => setQInput("")}
        >
          <Input.Search
            className={filterSearch}
            allowClear
            placeholder="Nome do tamanho…"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
          />
        </ListFilters>
      ) : isCrusts ? (
        <ListFilters
          className="mb-3 shrink-0"
          activeCount={crustFilterCount}
          trailing={bulkTrailing}
          onClear={() => setQInput("")}
        >
          <Input.Search
            className={filterSearch}
            allowClear
            placeholder="Nome da borda…"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
          />
        </ListFilters>
      ) : (
        <ListFilters
          className="mb-3 shrink-0"
          activeCount={addonFilterCount}
          trailing={bulkTrailing}
          onClear={() => {
            setQInput("");
            setActive(undefined);
          }}
        >
          <Input.Search
            className={filterSearch}
            allowClear
            placeholder="Nome do adicional…"
            value={qInput}
            onChange={(event) => setQInput(event.target.value)}
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
      )}
      <FillTable
        shellRef={shellRef}
        tableAreaRef={tableAreaRef}
        pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
          setPage(nextPage);
          setLimit(nextSize);
          setSelectedKeys([]);
        })}
      >
        {isSizes ? (
          <Table
            rowKey="id"
            className={`${tableClass} ${tableGridFill}`}
            loading={sizesQuery.isPending && !sizesQuery.data}
            dataSource={sizes}
            pagination={false}
            scroll={{ x: 720, y: bodyHeight }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys,
            }}
            columns={[
              { title: "Nome", dataIndex: "name" },
              {
                title: "Preço",
                dataIndex: "price",
                width: 120,
                render: (value: number) => formatReais(value),
              },
              {
                title: "Máx. sabores",
                dataIndex: "maxSelect",
                width: 130,
              },
              {
                title: "No preço",
                dataIndex: "priceMode",
                width: 160,
                render: (value: Size["priceMode"]) =>
                  value === "replace" ? "Substitui" : "Soma",
              },
              {
                title: "Ações",
                width: 72,
                align: "center",
                render: (_, size) => (
                  <RowActions
                    items={[
                      {
                        key: "edit",
                        label: "Editar",
                        onClick: () => {
                          setEditingSize(size);
                          setOpen(true);
                        },
                      },
                      {
                        key: "delete",
                        label: "Excluir",
                        danger: true,
                        onClick: () => askDeleteSize(size),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        ) : isCrusts ? (
          <Table
            rowKey="id"
            className={`${tableClass} ${tableGridFill}`}
            loading={crustsQuery.isPending && !crustsQuery.data}
            dataSource={crusts}
            pagination={false}
            scroll={{ x: 560, y: bodyHeight }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys,
            }}
            columns={[
              { title: "Nome", dataIndex: "name" },
              {
                title: "Tipo",
                dataIndex: "pizzaKind",
                width: 110,
                render: (value: Crust["pizzaKind"]) => (
                  <Tag color={value === "doce" ? "magenta" : "blue"}>
                    {value === "doce" ? "Doce" : "Salgada"}
                  </Tag>
                ),
              },
              {
                title: "Soma no valor",
                dataIndex: "addsPrice",
                width: 140,
                render: (value: boolean) => (
                  <Tag color={value ? "gold" : "default"}>
                    {value ? "Sim" : "Não"}
                  </Tag>
                ),
              },
              {
                title: "Preço",
                dataIndex: "price",
                width: 120,
                render: (_: number, crust: Crust) =>
                  crust.addsPrice ? formatReais(crust.price) : "—",
              },
              {
                title: "Ações",
                width: 72,
                align: "center",
                render: (_, crust) => (
                  <RowActions
                    items={[
                      {
                        key: "edit",
                        label: "Editar",
                        onClick: () => {
                          setEditingCrust(crust);
                          setOpen(true);
                        },
                      },
                      {
                        key: "delete",
                        label: "Excluir",
                        danger: true,
                        onClick: () => askDeleteCrust(crust),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        ) : (
          <Table
            rowKey="id"
            className={`${tableClass} ${tableGridFill}`}
            loading={addonsQuery.isPending && !addonsQuery.data}
            dataSource={addons}
            pagination={false}
            scroll={{ x: 640, y: bodyHeight }}
            rowSelection={{
              selectedRowKeys: selectedKeys,
              onChange: setSelectedKeys,
            }}
            columns={[
              { title: "Nome", dataIndex: "name" },
              {
                title: "Valor",
                dataIndex: "price",
                width: 120,
                render: (value: number) => formatReais(value),
              },
              { title: "Ordem", dataIndex: "sortOrder", width: 100 },
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
                render: (_, addon) => (
                  <RowActions
                    items={[
                      {
                        key: "edit",
                        label: "Editar",
                        onClick: () => {
                          setEditingAddon(addon);
                          setOpen(true);
                        },
                      },
                      {
                        key: "delete",
                        label: "Excluir",
                        danger: true,
                        onClick: () => askDeleteAddon(addon),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </FillTable>
      <div className={listCards}>
        {isSizes ? (
          <MobileCardList
            loading={sizesQuery.isPending && !sizesQuery.data}
            isEmpty={sizes.length === 0}
            empty={
              sizeFilterCount > 0
                ? "Nenhum tamanho encontrado com esses filtros."
                : "Inclua o primeiro tamanho. P, M, G e Família entram automaticamente se a tabela estiver vazia."
            }
            pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
              setPage(nextPage);
              setLimit(nextSize);
            })}
          >
            {sizes.map((size) => (
              <SizeCard
                key={size.id}
                size={size}
                onEdit={(item) => {
                  setEditingSize(item);
                  setOpen(true);
                }}
                onDelete={askDeleteSize}
              />
            ))}
          </MobileCardList>
        ) : isCrusts ? (
          <MobileCardList
            loading={crustsQuery.isPending && !crustsQuery.data}
            isEmpty={crusts.length === 0}
            empty={
              crustFilterCount > 0
                ? "Nenhuma borda encontrada com esses filtros."
                : "Inclua a primeira borda. Sem Borda, cheddar e Catupiry entram automaticamente se a tabela estiver vazia."
            }
            pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
              setPage(nextPage);
              setLimit(nextSize);
            })}
          >
            {crusts.map((crust) => (
              <CrustCard
                key={crust.id}
                crust={crust}
                onEdit={(item) => {
                  setEditingCrust(item);
                  setOpen(true);
                }}
                onDelete={askDeleteCrust}
              />
            ))}
          </MobileCardList>
        ) : (
          <MobileCardList
            loading={addonsQuery.isPending && !addonsQuery.data}
            isEmpty={addons.length === 0}
            empty={
              addonFilterCount > 0
                ? "Nenhum adicional encontrado com esses filtros."
                : "Inclua o primeiro adicional para oferecer extras no WhatsApp."
            }
            pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
              setPage(nextPage);
              setLimit(nextSize);
            })}
          >
            {addons.map((addon) => (
              <AddonCard
                key={addon.id}
                addon={addon}
                onEdit={(item) => {
                  setEditingAddon(item);
                  setOpen(true);
                }}
                onDelete={askDeleteAddon}
              />
            ))}
          </MobileCardList>
        )}
      </div>
      <AddonForm
        open={open && isAddons}
        addon={editingAddon}
        submitting={saveAddonMutation.isPending}
        onCancel={() => {
          setOpen(false);
          setEditingAddon(null);
        }}
        onSubmit={async (values) => {
          await saveAddonMutation.mutateAsync(values);
        }}
      />
      <CrustForm
        open={open && isCrusts}
        crust={editingCrust}
        submitting={saveCrustMutation.isPending}
        onCancel={() => {
          setOpen(false);
          setEditingCrust(null);
        }}
        onSubmit={async (values) => {
          await saveCrustMutation.mutateAsync(values);
        }}
      />
      <SizeForm
        open={open && isSizes}
        size={editingSize}
        submitting={saveSizeMutation.isPending}
        onCancel={() => {
          setOpen(false);
          setEditingSize(null);
        }}
        onSubmit={async (values) => {
          await saveSizeMutation.mutateAsync(values);
        }}
      />
    </div>
  );
}
