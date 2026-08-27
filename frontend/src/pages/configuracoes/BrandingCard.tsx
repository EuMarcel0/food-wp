import { useEffect, useMemo, useState } from "react";
import { Formik, Form as FormikForm } from "formik";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CameraOutlined } from "@ant-design/icons";
import { Alert, Avatar, Button, Card, Input, Upload } from "antd";
import { FormField } from "../../components/FormField";
import { api } from "../../lib/api";
import { fileToBase64, prepareStorePhoto } from "../../lib/image";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import {
  storeBrandingSchema,
  type StoreBrandingValues,
} from "../../lib/validation";
import type { Store } from "../../types";

export function BrandingCard({
  store,
  whatsappReady,
}: {
  store?: Store;
  whatsappReady?: boolean;
}) {
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = useMemo(() => {
    if (photo) return URL.createObjectURL(photo);
    return store?.profilePhotoUrl || undefined;
  }, [photo, store?.profilePhotoUrl]);

  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(preview ?? "");
  }, [photo, preview]);

  const saveMutation = useMutation({
    mutationFn: async (values: StoreBrandingValues) => {
      let photoPayload: { mime: string; data: string } | undefined;
      if (photo) {
        const prepared = await prepareStorePhoto(photo);
        photoPayload = {
          mime: "image/jpeg",
          data: await fileToBase64(prepared),
        };
      }
      return api.updateStore({
        name: values.name.trim(),
        photo: photoPayload,
      });
    },
    onSuccess: async (result) => {
      setPhoto(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
      if (result.whatsappError) {
        toast.error(`Salvo no painel. WhatsApp: ${result.whatsappError}`);
        return;
      }
      toast.success(
        whatsappReady
          ? "Perfil atualizado. A foto entra no WhatsApp em alguns minutos."
          : "Perfil salvo. Conecte o WhatsApp para a foto ir para a conversa.",
      );
    },
  });

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft"
      title="Perfil do estabelecimento"
    >
      <p className="mb-5 max-w-xl text-sm leading-normal text-food-muted">
        Nome e foto que o cliente vê. A foto atualiza o avatar da conversa no
        WhatsApp. O nome entra nas mensagens do bot. O título do chat no
        WhatsApp continua sendo o nome verificado na Meta.
      </p>

      <Formik
        enableReinitialize
        initialValues={{ name: store?.name ?? "" }}
        validationSchema={storeBrandingSchema}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            await saveMutation.mutateAsync(values);
          } catch (error) {
            helpers.setStatus(
              error instanceof Error
                ? error.message
                : "Não foi possível salvar o perfil.",
            );
          }
        }}
      >
        {({ isSubmitting, status, values }) => (
          <FormikForm>
            {status ? (
              <Alert
                type="error"
                showIcon
                className="mb-3"
                message={status}
              />
            ) : null}

            <div className="max-w-md">
              <div className="mb-4 flex items-center gap-3">
                <Avatar
                  src={preview}
                  size={72}
                  className="shrink-0 border border-food-border bg-food-chip text-2xl"
                >
                  {(values.name || "E").trim().charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <Upload
                    accept="image/png,image/jpeg,image/webp"
                    showUploadList={false}
                    beforeUpload={(file) => {
                      if (file.size > 2 * 1024 * 1024) {
                        toast.error("A foto precisa ter no máximo 2 MB.");
                        return Upload.LIST_IGNORE;
                      }
                      setPhoto(file);
                      return false;
                    }}
                  >
                    <Button icon={<CameraOutlined />}>Trocar foto</Button>
                  </Upload>
                  <p className="mb-0 mt-1.5 text-xs text-food-muted">
                    JPG, PNG ou WEBP · quadrada · até 2 MB
                  </p>
                </div>
              </div>
              <FormField name="name" label="Nome do estabelecimento">
                <Input placeholder="Ex.: Pizzaria do Bairro…" maxLength={80} />
              </FormField>
              <Button
                type="primary"
                htmlType="submit"
                loading={isSubmitting || saveMutation.isPending}
                disabled={!store}
              >
                Salvar perfil
              </Button>
            </div>
          </FormikForm>
        )}
      </Formik>
    </Card>
  );
}
