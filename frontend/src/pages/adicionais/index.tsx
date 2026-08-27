import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Input, Select, Table, Tabs, Tag } from "antd";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { useDialog } from "../../dialog";
import { AddonCard } from "./AddonCard";
import { CrustCard } from "./CrustCard";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/hooks";
import { toast } from "../../lib/toast";
import { formatReais } from "../../lib/format";
import { PAGE_SIZE, clampPage, serverPagination } from "../../lib/pagination";
import { queryKeys } from "../../lib/queryKeys";
import type { Addon, Crust } from "../../types";
import type { AddonValues, CrustValues } from "../../lib/validation";
import { AddonForm, toAddonPayload } from "./AddonForm";
import { CrustForm, toCrustPayload } from "./CrustForm";
import { filterSearch, filterSelect, listCards, tableClass, tableWrap } from "../../ui";

export function AddonsPage() {
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("addons");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [editingCrust, setEditingCrust] = useState<Crust | null>(null);
  const [qInput, setQInput] = useState("");
  const [active, setActive] = useState<boolean | undefined>();
  const q = useDebouncedValue(qInput.trim(), 300);
  const addonFilters = { q: q || undefined, active };
  const crustFilters = { q: q || undefined };
  const addonFilterCount = [q, active !== undefined].filter(Boolean).length;
  const crustFilterCount = q ? 1 : 0;
  const isCrusts = tab === "crusts";

  useEffect(() => {
    setPage(1);
  }, [q, active, tab]);

  const addonsQuery = useQuery({
    queryKey: queryKeys.addons.list(page, limit, addonFilters),
    queryFn: () => api.listAddons(page, limit, addonFilters),
    placeholderData: keepPreviousData,
    enabled: !isCrusts,
  });

  const crustsQuery = useQuery({
    queryKey: queryKeys.crusts.list(page, limit, crustFilters),
    queryFn: () => api.listCrusts(page, limit, crustFilters),
    placeholderData: keepPreviousData,
    enabled: isCrusts,
  });

  const listQuery = isCrusts ? crustsQuery : addonsQuery;
  const result = listQuery.data;
  const addons = addonsQuery.data?.items ?? [];
  const crusts = crustsQuery.data?.items ?? [];
  const total = result?.total ?? 0;

  useEffect(() => {
    if (!result) return;
    const nextPage = clampPage(page, limit, result.total);
    if (nextPage !== page) setPage(nextPage);
  }, [limit, page, result]);

  async function refreshAddons() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.addons.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
    ]);
  }

  async function refreshCrusts() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.crusts.all });
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
    onSuccess: async () => {
      toast.success("Adicional excluído.");
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
    onSuccess: async () => {
      toast.success("Borda excluída.");
      await refreshCrusts();
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

  function openCreate() {
    setEditingAddon(null);
    setEditingCrust(null);
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        kicker="Extras"
        title="Adicionais"
        subtitle="Cadastre extras e bordas. No item, marque quais adicionais entram e se o bot deve perguntar a borda."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Incluir
          </Button>
        }
      />
      <Tabs
        activeKey={tab}
        onChange={(key) => {
          setTab(key);
          setQInput("");
          setActive(undefined);
          setOpen(false);
          setEditingAddon(null);
          setEditingCrust(null);
        }}
        items={[
          { key: "addons", label: "Adicional" },
          { key: "crusts", label: "Bordas" },
        ]}
      />
      {isCrusts ? (
        <>
          <ListFilters
            activeCount={crustFilterCount}
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
          <div className={tableWrap}>
            <Table
              rowKey="id"
              className={tableClass}
              loading={crustsQuery.isPending && !crustsQuery.data}
              dataSource={crusts}
              pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
                setPage(nextPage);
                setLimit(nextSize);
              })}
              scroll={{ x: 560 }}
              columns={[
                { title: "Nome", dataIndex: "name" },
                {
                  title: "Soma no valor",
                  dataIndex: "addsPrice",
                  width: 160,
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
          </div>
          <div className={listCards}>
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
          </div>
          <CrustForm
            open={open}
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
        </>
      ) : (
        <>
          <ListFilters
            activeCount={addonFilterCount}
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
          <div className={tableWrap}>
            <Table
              rowKey="id"
              className={tableClass}
              loading={addonsQuery.isPending && !addonsQuery.data}
              dataSource={addons}
              pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
                setPage(nextPage);
                setLimit(nextSize);
              })}
              scroll={{ x: 640 }}
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
          </div>
          <div className={listCards}>
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
          </div>
          <AddonForm
            open={open}
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
        </>
      )}
    </>
  );
}
