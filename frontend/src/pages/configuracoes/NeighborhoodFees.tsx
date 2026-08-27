import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DeleteOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, Table } from "antd";
import { FormControl, FormField } from "../../components/FormField";
import { useDialog } from "../../dialog";
import { api } from "../../lib/api";
import { formatBRL } from "../../lib/format";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import {
  defaultDeliveryFeeSchema,
  maskBRL,
  neighborhoodFeeSchema,
  parseReais,
  type DefaultDeliveryFeeValues,
  type NeighborhoodFeeValues,
} from "../../lib/validation";
import type { Store } from "../../types";
import { tableClass } from "../../ui";

function toCents(value: string) {
  return Math.round((parseReais(value) ?? 0) * 100);
}

export function NeighborhoodFees({ store }: { store?: Store }) {
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const neighborhoods = store?.neighborhoods ?? [];

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

  const removeNeighborhood = useMutation({
    mutationFn: (id: string) => api.deleteNeighborhood(id),
    onSuccess: async () => {
      toast.success("Bairro excluído.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

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
              <Alert
                type="error"
                showIcon
                className="mb-3"
                message={status}
              />
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
              <Alert
                type="error"
                showIcon
                className="mb-3"
                message={status}
              />
            ) : null}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1 max-w-sm">
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

      <Table
        className={tableClass}
        rowKey="id"
        size="small"
        pagination={false}
        locale={{
          emptyText:
            "Nenhum bairro ainda. Pedidos de entrega usam a taxa default.",
        }}
        dataSource={neighborhoods}
        columns={[
          { title: "Bairro", dataIndex: "name" },
          {
            title: "Taxa",
            dataIndex: "feeCents",
            width: 140,
            render: (cents: number) => formatBRL(cents),
          },
          {
            title: "",
            key: "actions",
            width: 56,
            align: "right",
            render: (_, neighborhood) => (
              <Button
                type="text"
                danger
                aria-label={`Excluir ${neighborhood.name}`}
                icon={<DeleteOutlined />}
                loading={
                  removeNeighborhood.isPending &&
                  removeNeighborhood.variables === neighborhood.id
                }
                onClick={() =>
                  void dialog.delete({
                    title: "Excluir bairro",
                    description: (
                      <>
                        Excluir a taxa de <strong>{neighborhood.name}</strong>?
                        Entregas nesse bairro passam a usar a taxa default.
                      </>
                    ),
                    onConfirm: () =>
                      removeNeighborhood.mutateAsync(neighborhood.id),
                  })
                }
              />
            ),
          },
        ]}
      />
    </Card>
  );
}
