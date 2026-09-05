import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, Skeleton } from "antd";
import { api } from "../../lib/api";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import type { Store } from "../../types";

export function BatchCategorySettingsCard({ store }: { store?: Store }) {
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories.options,
    queryFn: () => api.categories(true),
  });
  const categories = (categoriesQuery.data ?? [])
    .slice()
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name, "pt-BR"),
    );

  const saveMutation = useMutation({
    mutationFn: (batchCategoryIds: string[]) =>
      api.updateStore({ batchCategoryIds }),
    onSuccess: async () => {
      toast.success("Categorias de montagem salvas.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
    },
  });

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-xl"
      title="Quantidade para montagem por categoria"
    >
      <Formik
        enableReinitialize
        initialValues={{
          batchCategoryIds: store?.batchCategoryIds ?? [],
        }}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            await saveMutation.mutateAsync(values.batchCategoryIds);
          } catch (error) {
            helpers.setStatus(
              error instanceof Error
                ? error.message
                : "Não foi possível salvar.",
            );
          }
        }}
      >
        {({ isSubmitting, status, values, setFieldValue }) => (
          <FormikForm>
            {status ? (
              <Alert
                type="error"
                showIcon
                className="mb-3"
                message={status}
              />
            ) : null}

            <p className="mb-4 text-sm leading-normal text-food-muted">
              Nas categorias marcadas, depois que o cliente escolhe a categoria o
              bot pergunta <strong>Você vai querer quantas?</strong> e monta
              cada item em sequência, sem ir ao carrinho no meio do lote.
            </p>

            {categoriesQuery.isPending ? (
              <Skeleton active paragraph={{ rows: 3 }} className="mb-4" />
            ) : categories.length === 0 ? (
              <p className="mb-4 text-sm text-food-muted">
                Nenhuma categoria cadastrada. Crie categorias em Cardápio →
                Categorias.
              </p>
            ) : (
              <Checkbox.Group
                className="mb-4 flex flex-col gap-2"
                value={values.batchCategoryIds}
                onChange={(next) =>
                  setFieldValue(
                    "batchCategoryIds",
                    next.map((id) => String(id)),
                  )
                }
                options={categories.map((category) => ({
                  label: category.name,
                  value: category.id,
                }))}
              />
            )}

            <Button
              type="primary"
              htmlType="submit"
              loading={isSubmitting || saveMutation.isPending}
              disabled={!store || categoriesQuery.isPending}
            >
              Salvar
            </Button>
          </FormikForm>
        )}
      </Formik>
    </Card>
  );
}
