import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DeleteOutlined, PictureOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Image, Radio, Upload } from "antd";
import { api } from "../../lib/api";
import { fileToBase64, prepareMenuImage } from "../../lib/image";
import { toast } from "../../lib/toast";
import { queryKeys } from "../../lib/queryKeys";
import type { BotFlowVersion, Store } from "../../types";

const FLOW_OPTIONS: { value: BotFlowVersion; title: string; description: string }[] = [
  {
    value: "v1",
    title: "v1 · Completa",
    description: "Cliente navega pelo cardápio em menus e botões, item por item.",
  },
  {
    value: "v2",
    title: "v2 · Simplificada (IA)",
    description:
      "Bot envia a imagem do cardápio e o cliente digita o pedido em uma mensagem. A IA monta o carrinho com os preços cadastrados.",
  },
];

export function BotFlowSettingsCard({ store }: { store?: Store }) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState<BotFlowVersion>(store?.botFlowVersion ?? "v1");
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVersion(store?.botFlowVersion ?? "v1");
  }, [store?.botFlowVersion]);

  const preview = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    if (removed) return undefined;
    return store?.menuImageUrl || undefined;
  }, [file, removed, store?.menuImageUrl]);

  useEffect(() => {
    if (!file || !preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [file, preview]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let menuImage: { mime: string; data: string } | undefined;
      if (file) {
        const prepared = await prepareMenuImage(file);
        menuImage = { mime: "image/jpeg", data: await fileToBase64(prepared) };
      }
      return api.updateStore({
        botFlowVersion: version,
        ...(menuImage ? { menuImage } : removed ? { menuImageUrl: null } : {}),
      });
    },
    onSuccess: async () => {
      setFile(null);
      setRemoved(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.store });
      toast.success(version === "v2" ? "Bot v2 (simplificado) ativo." : "Bot v1 (completo) ativo.");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    },
  });

  const dirty =
    version !== (store?.botFlowVersion ?? "v1") || Boolean(file) || removed;

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-2xl"
      title="Fluxo do bot no WhatsApp"
    >
      {error ? <Alert type="error" showIcon className="mb-3" message={error} /> : null}

      <p className="mb-4 text-sm leading-normal text-food-muted">
        Escolha como o cliente monta o pedido. Endereço, taxa, pagamento e
        confirmação seguem iguais nas duas versões. Conversas que já estão em
        andamento continuam na etapa em que estavam.
      </p>

      <Radio.Group
        value={version}
        onChange={(event) => setVersion(event.target.value as BotFlowVersion)}
        className="!mb-5 !flex w-full flex-col gap-2"
      >
        {FLOW_OPTIONS.map((option) => (
          <Radio
            key={option.value}
            value={option.value}
            className="!me-0 rounded-xl border border-food-border !px-4 !py-3 [&>span:last-child]:!ps-3 [&.ant-radio-wrapper-checked]:border-food-accent [&.ant-radio-wrapper-checked]:bg-food-accent-soft"
          >
            <span className="block text-sm font-semibold text-food-text">{option.title}</span>
            <span className="block text-[13px] leading-snug text-food-muted">{option.description}</span>
          </Radio>
        ))}
      </Radio.Group>

      <h3 className="m-0 mb-1 text-base font-bold tracking-tight text-food-text">
        Imagem do cardápio
      </h3>
      <p className="mb-3 text-[13px] leading-snug text-food-muted">
        Enviada na saudação da v2 para o cliente escolher o que pedir. Use uma
        imagem legível no celular (JPG ou PNG, até 3 MB).
      </p>

      <div className="mb-4 flex flex-wrap items-start gap-4">
        {preview ? (
          <Image
            src={preview}
            alt="Cardápio"
            width={120}
            height={160}
            className="rounded-xl border border-food-border object-cover"
          />
        ) : (
          <div className="flex h-[160px] w-[120px] items-center justify-center rounded-xl border border-dashed border-food-border bg-food-chip text-food-muted">
            <PictureOutlined className="text-2xl" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Upload
            accept="image/png,image/jpeg,image/webp"
            showUploadList={false}
            beforeUpload={(next) => {
              if (next.size > 8 * 1024 * 1024) {
                toast.error("A imagem precisa ter no máximo 8 MB antes da compressão.");
                return Upload.LIST_IGNORE;
              }
              setFile(next);
              setRemoved(false);
              return false;
            }}
          >
            <Button icon={<PictureOutlined />}>{preview ? "Trocar imagem" : "Enviar imagem"}</Button>
          </Upload>
          {preview ? (
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              onClick={() => {
                setFile(null);
                setRemoved(true);
              }}
            >
              Remover
            </Button>
          ) : null}
        </div>
      </div>

      {version === "v2" && !preview ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message="Sem imagem do cardápio, a v2 só pede para o cliente digitar o pedido."
        />
      ) : null}

      <Button
        type="primary"
        loading={saveMutation.isPending}
        disabled={!store || !dirty}
        onClick={() => saveMutation.mutate()}
      >
        Salvar
      </Button>
    </Card>
  );
}
