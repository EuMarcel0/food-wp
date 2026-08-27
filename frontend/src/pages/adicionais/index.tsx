import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Input, Select, Table, Tag } from "antd";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { useDialog } from "../../dialog";
import { AddonCard } from "./AddonCard";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/hooks";
import { toast } from "../../lib/toast";
import { formatReais } from "../../lib/format";
import { PAGE_SIZE, clampPage, serverPagination } from "../../lib/pagination";
import { queryKeys } from "../../lib/queryKeys";
import type { Addon } from "../../types";
import type { AddonValues } from "../../lib/validation";
import { AddonForm, toAddonPayload } from "./AddonForm";
import { filterSearch, filterSelect, listCards, tableClass, tableWrap } from "../../ui";

export function AddonsPage() {
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Addon | null>(null);
  const [qInput, setQInput] = useState("");
  const [active, setActive] = useState<boolean | undefined>();
  const q = useDebouncedValue(qInput.trim(), 300);
  const filters = { q: q || undefined, active };
  const activeCount = [q, active !== undefined].filter(Boolean).length;

  useEffect(() => {
    setPage(1);
  }, [q, active]);

  const listQuery = useQuery({
    queryKey: queryKeys.addons.list(page, limit, filters),
    queryFn: () => api.listAddons(page, limit, filters),
    placeholderData: keepPreviousData,
  });

  const result = listQuery.data;
  const addons = result?.items ?? [];
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

  const saveMutation = useMutation({
    mutationFn: async (values: AddonValues) => {
      const payload = toAddonPayload(values);
      if (editing) return api.updateAddon(editing.id, payload);
      return api.createAddon(payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "Adicional atualizado." : "Adicional incluído.");
      setOpen(false);
      setEditing(null);
      await refreshAddons();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (addon: Addon) => api.deleteAddon(addon.id),
    onSuccess: async () => {
      toast.success("Adicional excluído.");
      await refreshAddons();
    },
  });

  function askDelete(addon: Addon) {
    void dialog.delete({
      title: "Excluir adicional",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{addon.name}</strong>? Os itens
          do cardápio que usam este adicional deixam de oferecê-lo.
        </>
      ),
      onConfirm: () => deleteMutation.mutateAsync(addon),
    });
  }

  return (
    <>
      <PageHeader
        kicker="Extras"
        title="Adicionais"
        subtitle="Cadastre extras como bacon ou cheddar. Depois marque quais entram em cada item do cardápio."
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setEditing(null);
            setOpen(true);
          }}>
            Incluir
          </Button>
        }
      />
      <ListFilters
        activeCount={activeCount}
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
          loading={listQuery.isPending && !result}
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
                        setEditing(addon);
                        setOpen(true);
                      },
                    },
                    {
                      key: "delete",
                      label: "Excluir",
                      danger: true,
                      onClick: () => askDelete(addon),
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
          loading={listQuery.isPending && !result}
          isEmpty={addons.length === 0}
          empty={
            activeCount > 0
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
                setEditing(item);
                setOpen(true);
              }}
              onDelete={askDelete}
            />
          ))}
        </MobileCardList>
      </div>
      <AddonForm
        open={open}
        addon={editing}
        submitting={saveMutation.isPending}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSubmit={async (values) => {
          await saveMutation.mutateAsync(values);
        }}
      />
    </>
  );
}
