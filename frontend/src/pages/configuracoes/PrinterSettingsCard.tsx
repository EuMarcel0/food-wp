import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Select } from "antd";
import { api } from "../../lib/api";
import { getDefaultPrinter, setDefaultPrinter } from "../../lib/printer";
import { queryKeys } from "../../lib/queryKeys";
import { toast } from "../../lib/toast";

export function PrinterSettingsCard() {
  const printersQuery = useQuery({
    queryKey: queryKeys.printers,
    queryFn: api.printers,
  });
  const printers = printersQuery.data?.printers ?? [];
  const host = printersQuery.data?.host;
  const [selected, setSelected] = useState("");

  useEffect(() => {
    const listed = printersQuery.data?.printers ?? [];
    setSelected((current) => {
      if (current) return current;
      const saved = getDefaultPrinter();
      if (saved) return saved;
      return listed.find((item) => item.isDefault)?.name ?? "";
    });
  }, [printersQuery.data]);

  const options = useMemo(() => {
    const names = new Set(printers.map((item) => item.name));
    const extra =
      selected && !names.has(selected)
        ? [{ value: selected, label: `${selected} (salva neste PC)` }]
        : [];
    return [
      ...extra,
      ...printers.map((item) => ({
        value: item.name,
        label: [
          item.name,
          item.isDefault ? "padrão do Windows" : null,
          item.offline ? "offline" : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    ];
  }, [printers, selected]);

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-xl"
      title="Impressora padrão"
    >
      <p className="mb-4 text-sm leading-normal text-food-muted">
        Lista as impressoras instaladas neste computador. A escolha vale só
        neste navegador, para a cozinha deste PC.
      </p>

      {printersQuery.isError ? (
        <Alert
          type="error"
          showIcon
          className="mb-3"
          message="Não foi possível listar as impressoras."
        />
      ) : null}

      {!printersQuery.isPending && !printers.length && !printersQuery.isError ? (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          message={
            host
              ? `Nenhuma impressora encontrada em ${host}. A API precisa estar rodando no computador da impressora.`
              : "Nenhuma impressora encontrada neste computador."
          }
        />
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          showSearch
          allowClear
          placeholder="Escolha a impressora"
          optionFilterProp="label"
          value={selected || undefined}
          options={options}
          style={{ width: "100%", maxWidth: 420 }}
          loading={printersQuery.isPending}
          onChange={(value) => setSelected(value ?? "")}
        />
        <Button
          icon={<ReloadOutlined />}
          onClick={() => printersQuery.refetch()}
          loading={printersQuery.isFetching}
        >
          Atualizar lista
        </Button>
      </div>
      {host ? (
        <p className="mb-3 text-xs text-food-muted">Computador: {host}</p>
      ) : null}
      <Button
        type="primary"
        disabled={!selected}
        onClick={() => {
          setDefaultPrinter(selected);
          toast.success("Impressora padrão salva neste computador.");
        }}
      >
        Salvar impressora
      </Button>
    </Card>
  );
}
