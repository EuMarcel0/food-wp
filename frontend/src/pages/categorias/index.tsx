import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Input, Select, Table, Tag } from "antd";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { useDialog } from "../../dialog";
import { CategoryCard } from "./CategoryCard";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/hooks";
import { toast } from "../../lib/toast";
import { PAGE_SIZE, clampPage, serverPagination } from "../../lib/pagination";
import { queryKeys } from "../../lib/queryKeys";
import type { Category } from "../../types";
import type { CategoryValues } from "../../lib/validation";
import { CategoryForm, toCategoryPayload } from "./CategoryForm";

export function CategoriesPage() {
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [qInput, setQInput] = useState("");
  const [active, setActive] = useState<boolean | undefined>();
  const q = useDebouncedValue(qInput.trim(), 300);
  const filters = { q: q || undefined, active };
  const activeCount = [q, active !== undefined].filter(Boolean).length;

  useEffect(() => {
    setPage(1);
  }, [q, active]);

  const listQuery = useQuery({
    queryKey: queryKeys.categories.list(page, limit, filters),
    queryFn: () => api.listCategories(page, limit, filters),
    placeholderData: keepPreviousData,
  });

  const result = listQuery.data;
  const categories = result?.items ?? [];
  const total = result?.total ?? 0;

  useEffect(() => {
    if (!result) return;
    const nextPage = clampPage(page, limit, result.total);
    if (nextPage !== page) setPage(nextPage);
  }, [limit, page, result]);

  const saveMutation = useMutation({
    mutationFn: async (values: CategoryValues) => {
      const payload = toCategoryPayload(values);
      if (editing) return api.updateCategory(editing.id, payload);
      return api.createCategory(payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "Categoria atualizada." : "Categoria incluída.");
      setOpen(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (category: Category) => api.deleteCategory(category.id),
    onSuccess: async () => {
      toast.success("Categoria excluída.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.categories.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
      ]);
    },
  });

  function askDelete(category: Category) {
    void dialog.delete({
      title: "Excluir categoria",
      description: (
        <>
          Tem certeza que deseja excluir <strong>{category.name}</strong>? Esta
          ação não pode ser desfeita. Se houver itens do cardápio nesta
          categoria, a exclusão será recusada.
        </>
      ),
      onConfirm: () => deleteMutation.mutateAsync(category),
    });
  }

  return (
    <>
      <PageHeader
        kicker="Organização"
        title="Categorias"
        subtitle="Organize o cardápio. Só as ativas aparecem no WhatsApp e no cadastro de itens."
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
          className="filter-search"
          allowClear
          placeholder="Nome da categoria…"
          value={qInput}
          onChange={(event) => setQInput(event.target.value)}
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
            { value: "1", label: "Ativas" },
            { value: "0", label: "Inativas" },
          ]}
        />
      </ListFilters>
      <div className="table-wrap list-table">
        <Table
          rowKey="id"
          loading={listQuery.isPending && !result}
          dataSource={categories}
          pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
            setPage(nextPage);
            setLimit(nextSize);
          })}
          scroll={{ x: 640 }}
          columns={[
            { title: "Nome", dataIndex: "name" },
            { title: "Ordem", dataIndex: "sortOrder", width: 100 },
            {
              title: "Ativa",
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
              render: (_, category) => (
                <RowActions
                  items={[
                    {
                      key: "edit",
                      label: "Editar",
                      onClick: () => {
                        setEditing(category);
                        setOpen(true);
                      },
                    },
                    {
                      key: "delete",
                      label: "Excluir",
                      danger: true,
                      onClick: () => askDelete(category),
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
          loading={listQuery.isPending && !result}
          isEmpty={categories.length === 0}
          empty={
            activeCount > 0
              ? "Nenhuma categoria encontrada com esses filtros."
              : "Inclua a primeira categoria para organizar o cardápio."
          }
          pagination={serverPagination(page, limit, total, (nextPage, nextSize) => {
            setPage(nextPage);
            setLimit(nextSize);
          })}
        >
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onEdit={(item) => {
                setEditing(item);
                setOpen(true);
              }}
              onDelete={askDelete}
            />
          ))}
        </MobileCardList>
      </div>
      <CategoryForm
        open={open}
        category={editing}
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
