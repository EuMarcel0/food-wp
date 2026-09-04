import { useEffect, useMemo, useState } from "react";
import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DeleteOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, Table } from "antd";
import { FormControl, FormField } from "../../components/FormField";
import { useDialog } from "../../dialog";
import { api } from "../../lib/api";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import { filterSearch, tableClass } from "../../ui";
import {
  defaultDeliveryFeeSchema,
  maskBRL,
  neighborhoodFeeSchema,
  parseReais,
  type DefaultDeliveryFeeValues,
  type NeighborhoodFeeValues,
} from "../../lib/validation";
import type { DeliveryNeighborhood, Store } from "../../types";

const PAGE_SIZE = 10;

function toCents(value: string) {
  return Math.round((parseReais(value) ?? 0) * 100);
}

type RowDraft = { name: string; fee: string };

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function NeighborhoodFees({ store }: { store?: Store }) {
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const neighborhoods = store?.neighborhoods ?? [];
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});

  useEffect(() => {
    setDrafts((current) => {
      const next: Record<string, RowDraft> = {};
      for (const zone of neighborhoods) {
        const draft = current[zone.id];
        if (!draft) continue;
        const dirty =
          draft.name.trim() !== zone.name ||
          toCents(draft.fee) !== zone.feeCents;
        if (dirty) next[zone.id] = draft;
      }
      return next;
    });
  }, [neighborhoods]);

  const filtered = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return neighborhoods;
    return neighborhoods.filter((item) =>
      normalizeName(item.name).includes(q),
    );
  }, [neighborhoods, query]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filtered.length / limit) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [filtered.length, limit, page]);

  const saveDefault = useMutation({
    mutationFn: (values: DefaultDeliveryFeeValues) =>
      api.updateStore({ deliveryFeeCents: toCents(values.deliveryFee ?? "") }),
    onSuccess: async () => {
      toast.success("Taxa default salva.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

  const addNeighborhood = useMutation({
    mutationFn: (values: NeighborhoodFeeValues) =>
      api.createNeighborhood({
        name: values.name.trim(),
        feeCents: toCents(values.fee),
      }),
    onSuccess: async () => {
      toast.success("Bairro cadastrado.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

  const updateNeighborhood = useMutation({
    mutationFn: (input: { id: string; name: string; feeCents: number }) =>
      api.updateNeighborhood(input.id, {
        name: input.name,
        feeCents: input.feeCents,
      }),
    onSuccess: async (_data, variables) => {
      toast.success("Bairro atualizado.");
      setDrafts((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

  const removeNeighborhood = useMutation({
    mutationFn: (id: string) => api.deleteNeighborhood(id),
    onSuccess: async (_data, id) => {
      toast.success("Bairro excluído.");
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

  function draftOf(zone: DeliveryNeighborhood): RowDraft {
    return (
      drafts[zone.id] ?? {
        name: zone.name,
        fee: maskBRL(String(zone.feeCents)),
      }
    );
  }

  function isDirty(zone: DeliveryNeighborhood) {
    const draft = draftOf(zone);
    return (
      draft.name.trim() !== zone.name || toCents(draft.fee) !== zone.feeCents
    );
  }

  function patchDraft(id: string, zone: DeliveryNeighborhood, patch: Partial<RowDraft>) {
    setDrafts((current) => {
      const base = current[id] ?? {
        name: zone.name,
        fee: maskBRL(String(zone.feeCents)),
      };
      return { ...current, [id]: { ...base, ...patch } };
    });
  }

  async function saveRow(zone: DeliveryNeighborhood) {
    const draft = draftOf(zone);
    const name = draft.name.trim();
    if (!name) {
      toast.error("Informe o bairro.");
      return;
    }
    const amount = parseReais(draft.fee);
    if (amount === null || amount < 0) {
      toast.error("Informe uma taxa válida.");
      return;
    }
    try {
      await updateNeighborhood.mutateAsync({
        id: zone.id,
        name,
        feeCents: Math.round(amount * 100),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    }
  }

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft"
      title="Taxas por bairro"
    >
      <p className="mb-4 max-w-xl text-sm leading-normal text-food-muted">
        No WhatsApp, depois de Entrega, o cliente escolhe o bairro nesta lista
        (com a taxa) e em seguida digita o endereço. Sem bairro cadastrado, vale
        a taxa default.
      </p>

      <Formik
        enableReinitialize
        initialValues={{
          deliveryFee: maskBRL(String(store?.deliveryFeeCents ?? 0)),
        }}
        validationSchema={defaultDeliveryFeeSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            await saveDefault.mutateAsync(values);
          } catch (error) {
            helpers.setStatus(
              error instanceof Error
                ? error.message
                : "Não foi possível salvar a taxa default.",
            );
          }
        }}
      >
        {({ isSubmitting, status }) => (
          <FormikForm className="mb-6 max-w-xl">
            {status ? (
              <Alert type="error" showIcon className="mb-3" message={status} />
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <FormControl name="deliveryFee" label="Taxa default">
                {({ value, setValue, setTouched }) => (
                  <Input
                    prefix="R$"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={String(value ?? "")}
                    onChange={(event) => setValue(maskBRL(event.target.value))}
                    onBlur={setTouched}
                    className="w-full max-w-[220px]"
                  />
                )}
              </FormControl>
              <Button
                type="primary"
                htmlType="submit"
                className="mb-3"
                loading={isSubmitting || saveDefault.isPending}
                disabled={!store}
              >
                Salvar
              </Button>
            </div>
          </FormikForm>
        )}
      </Formik>

      <Formik
        initialValues={{ name: "", fee: "0,00" }}
        validationSchema={neighborhoodFeeSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            await addNeighborhood.mutateAsync(values);
            helpers.resetForm();
          } catch (error) {
            helpers.setStatus(
              error instanceof Error
                ? error.message
                : "Não foi possível incluir o bairro.",
            );
          }
        }}
      >
        {({ isSubmitting, status }) => (
          <FormikForm className="mb-4">
            {status ? (
              <Alert type="error" showIcon className="mb-3" message={status} />
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] max-w-sm flex-1">
                <FormField name="name" label="Bairro">
                  <Input placeholder="Centro, Jardim América…" />
                </FormField>
              </div>
              <div className="w-[140px]">
                <FormControl name="fee" label="Taxa">
                  {({ value, setValue, setTouched }) => (
                    <Input
                      prefix="R$"
                      inputMode="numeric"
                      placeholder="0,00"
                      value={String(value ?? "")}
                      onChange={(event) => setValue(maskBRL(event.target.value))}
                      onBlur={setTouched}
                    />
                  )}
                </FormControl>
              </div>
              <Button
                type="primary"
                htmlType="submit"
                className="mb-3"
                loading={isSubmitting || addNeighborhood.isPending}
                disabled={!store}
              >
                Adicionar
              </Button>
            </div>
          </FormikForm>
        )}
      </Formik>

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <Input.Search
          allowClear
          className={filterSearch}
          placeholder="Filtrar por nome"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        {query.trim() ? (
          <Button
            onClick={() => {
              setQuery("");
              setPage(1);
            }}
          >
            Limpar
          </Button>
        ) : null}
      </div>

      <Table
        className={tableClass}
        rowKey="id"
        size="small"
        dataSource={filtered}
        locale={{
          emptyText: query.trim()
            ? "Nenhum bairro encontrado com esse filtro."
            : "Nenhum bairro ainda. Pedidos de entrega usam a taxa default.",
        }}
        pagination={{
          current: page,
          pageSize: limit,
          total: filtered.length,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50"],
          showTotal: (count) => (count === 1 ? "1 item" : `${count} itens`),
          className: "!m-0 px-0 py-3",
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setLimit(nextSize);
          },
        }}
        columns={[
          {
            title: "Bairro",
            dataIndex: "name",
            render: (_value, zone) => {
              const draft = draftOf(zone);
              return (
                <Input
                  value={draft.name}
                  aria-label={`Nome do bairro ${zone.name}`}
                  onChange={(event) =>
                    patchDraft(zone.id, zone, { name: event.target.value })
                  }
                />
              );
            },
          },
          {
            title: "Taxa",
            dataIndex: "feeCents",
            width: 160,
            render: (_value, zone) => {
              const draft = draftOf(zone);
              return (
                <Input
                  prefix="R$"
                  inputMode="numeric"
                  value={draft.fee}
                  aria-label={`Taxa de ${zone.name}`}
                  onChange={(event) =>
                    patchDraft(zone.id, zone, {
                      fee: maskBRL(event.target.value),
                    })
                  }
                />
              );
            },
          },
          {
            title: "",
            key: "actions",
            width: 96,
            align: "right",
            render: (_value, zone) => {
              const dirty = isDirty(zone);
              const saving =
                updateNeighborhood.isPending &&
                updateNeighborhood.variables?.id === zone.id;
              return (
                <div className="flex justify-end gap-1">
                  {dirty ? (
                    <Button
                      type="text"
                      aria-label={`Salvar ${zone.name}`}
                      icon={<SaveOutlined />}
                      loading={saving}
                      onClick={() => void saveRow(zone)}
                    />
                  ) : null}
                  <Button
                    type="text"
                    danger
                    aria-label={`Excluir ${zone.name}`}
                    icon={<DeleteOutlined />}
                    loading={
                      removeNeighborhood.isPending &&
                      removeNeighborhood.variables === zone.id
                    }
                    onClick={() =>
                      void dialog.delete({
                        title: "Excluir bairro",
                        description: (
                          <>
                            Excluir a taxa de <strong>{zone.name}</strong>?
                            Entregas nesse bairro passam a usar a taxa default.
                          </>
                        ),
                        onConfirm: () =>
                          removeNeighborhood.mutateAsync(zone.id),
                      })
                    }
                  />
                </div>
              );
            },
          },
        ]}
      />
    </Card>
  );
}
