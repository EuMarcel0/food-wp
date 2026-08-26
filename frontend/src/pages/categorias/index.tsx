import { useCallback, useEffect, useRef, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { Button, Input, Modal, Select, Table, Tag } from "antd";
import { ListFilters } from "../../components/ListFilters";
import { MobileCardList } from "../../components/MobileCardList";
import { PageHeader } from "../../components/PageHeader";
import { RowActions } from "../../components/RowActions";
import { CategoryCard } from "./CategoryCard";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/hooks";
import { toast } from "../../lib/toast";
import {
  PAGE_SIZE,
  clampPage,
  serverPagination,
} from "../../lib/pagination";
import type { Category } from "../../types";
import type { CategoryValues } from "../../lib/validation";
import { CategoryForm, toCategoryPayload } from "./CategoryForm";

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [qInput, setQInput] = useState("");
  const [active, setActive] = useState<boolean | undefined>();
  const q = useDebouncedValue(qInput.trim(), 300);
  const activeCount = [q, active !== undefined].filter(Boolean).length;
  const filterKey = `${q}|${active ?? ""}`;
  const filterKeyRef = useRef(filterKey);

  const load = useCallback(async () => {
    const result = await api.listCategories(page, limit, {
      q: q || undefined,
      active,
    });
    const nextPage = clampPage(page, limit, result.total);
    setCategories(result.items);
    setTotal(result.total);
    if (nextPage !== page) setPage(nextPage);
  }, [page, limit, q, active]);

  useEffect(() => {
    if (filterKeyRef.current !== filterKey) {
      filterKeyRef.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    setLoading(true);
    load()
      .catch(() => {
        setCategories([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [filterKey, load, page]);

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setOpen(true);
  }

  async function handleSave(values: CategoryValues) {
    setSaving(true);
    try {
      const payload = toCategoryPayload(values);
      if (editing) {
        await api.updateCategory(editing.id, payload);
        toast.success("Categoria atualizada.");
      } else {
        await api.createCategory(payload);
        toast.success("Categoria incluída.");
      }
      setOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(category: Category) {
    await api.deleteCategory(category.id);
    toast.success("Categoria excluída.");
    await load();
  }

  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle="Organize o cardápio. Só as ativas aparecem no WhatsApp e no cadastro de itens."
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
          setActive(undefined);
        }}
      >
        <Input.Search
          className="filter-search"
          allowClear
          placeholder="Nome da categoria"
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
          loading={loading}
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
                      onClick: () => openEdit(category),
                    },
                    {
                      key: "delete",
                      label: "Excluir",
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: "Excluir esta categoria?",
                          okText: "Excluir",
                          cancelText: "Cancelar",
                          okButtonProps: { danger: true },
                          onOk: () => handleDelete(category),
                        });
                      },
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
          isEmpty={categories.length === 0}
          empty={
            activeCount > 0
              ? "Nenhuma categoria encontrada com esses filtros."
              : "Nenhuma categoria nesta página."
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
              onEdit={openEdit}
              onDelete={(item) => {
                Modal.confirm({
                  title: "Excluir esta categoria?",
                  okText: "Excluir",
                  cancelText: "Cancelar",
                  okButtonProps: { danger: true },
                  onOk: () => handleDelete(item),
                });
              }}
            />
          ))}
        </MobileCardList>
      </div>
      <CategoryForm
        open={open}
        category={editing}
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
