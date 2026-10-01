import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudUploadOutlined, DeleteOutlined, EyeOutlined, SwapOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Image, Radio, Tooltip, Upload, type UploadProps } from "antd";
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

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

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

  const uploadProps: UploadProps = {
    accept: "image/png,image/jpeg,image/webp",
    showUploadList: false,
    multiple: false,
    beforeUpload: (next) => {
      if (next.size > 8 * 1024 * 1024) {
        toast.error("A imagem precisa ter no máximo 8 MB.");
        return Upload.LIST_IGNORE;
      }
      setFile(next);
      setRemoved(false);
      return false;
    },
  };

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

      {version === "v2" ? (
        <section className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="m-0 text-sm font-bold text-food-text">Imagem do cardápio</h3>
            <span className="text-xs text-food-muted">Enviada na saudação</span>
          </div>

          {preview ? (
            <div className="flex items-center gap-4 rounded-2xl border border-food-border bg-food-chip p-3">
              <Image
                src={preview}
                alt="Cardápio"
                width={64}
                height={84}
                className="rounded-lg object-cover"
                rootClassName="shrink-0 overflow-hidden rounded-lg ring-1 ring-food-border"
                preview={{ mask: <EyeOutlined className="text-base" /> }}
              />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-semibold text-food-text">
                  {file ? file.name : "Cardápio atual"}
                </p>
                <p className="m-0 mt-0.5 flex items-center gap-1.5 text-xs text-food-muted">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${file ? "bg-amber-500" : "bg-emerald-500"}`}
                  />
                  {file ? `Nova imagem · ${formatSize(file.size)} · salve para aplicar` : "Em uso no bot"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Upload {...uploadProps}>
                  <Button size="small" icon={<SwapOutlined />}>
                    Trocar
                  </Button>
                </Upload>
                <Tooltip title="Remover imagem">
                  <Button
                    size="small"
                    type="text"
                    danger
                    aria-label="Remover imagem"
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      setFile(null);
                      setRemoved(true);
                    }}
                  />
                </Tooltip>
              </div>
            </div>
          ) : (
            <Upload.Dragger
              {...uploadProps}
              className="block [&_.ant-upload-btn]:!px-4 [&_.ant-upload-btn]:!py-6 [&_.ant-upload-drag]:!rounded-2xl [&_.ant-upload-drag]:!border-food-border [&_.ant-upload-drag]:!bg-food-chip [&_.ant-upload-drag:hover]:!border-food-accent"
            >
              <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-food-accent-soft text-food-accent">
                <CloudUploadOutlined className="text-lg" />
              </span>
              <p className="m-0 text-sm font-semibold text-food-text">
                Arraste a imagem aqui ou <span className="text-food-accent">clique para enviar</span>
              </p>
              <p className="m-0 mt-1 text-xs text-food-muted">
                JPG, PNG ou WEBP · otimizada automaticamente para o WhatsApp
              </p>
            </Upload.Dragger>
          )}

          {!preview ? (
            <p className="m-0 mt-2 text-xs text-food-muted">
              Sem imagem, o bot só pede para o cliente digitar o pedido.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-center justify-end gap-3 border-t border-food-border pt-4">
        {dirty ? <span className="text-xs text-food-muted">Alterações não salvas</span> : null}
        <Button
          type="primary"
          loading={saveMutation.isPending}
          disabled={!store || !dirty}
          onClick={() => saveMutation.mutate()}
        >
          Salvar
        </Button>
      </div>
    </Card>
  );
}
