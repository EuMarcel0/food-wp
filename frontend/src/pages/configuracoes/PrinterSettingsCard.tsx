import { useEffect, useState } from "react";
import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Select, Tag } from "antd";
import {
  fetchPrintAgentHealth,
  fetchPrintAgentPrinters,
  getPrintAgentBase,
  getPrintAgentToken,
  pairPrintAgent,
  savePrintAgentPrinter,
  type PrintAgentPrinter,
} from "../../lib/printAgent";
import { toast } from "../../lib/toast";

export function PrinterSettingsCard() {
  const [online, setOnline] = useState(false);
  const [host, setHost] = useState("");
  const [checking, setChecking] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printers, setPrinters] = useState<PrintAgentPrinter[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const connected = Boolean(getPrintAgentToken());

  async function refreshHealth() {
    setChecking(true);
    setError(null);
    try {
      const health = await fetchPrintAgentHealth();
      setOnline(Boolean(health.ok));
      setHost(health.host || "");
      if (health.printerName) setSelected(health.printerName);
    } catch {
      setOnline(false);
      setHost("");
      setError(
        "Agente offline. No PC da cozinha, abra a pasta print-agent e rode npm start (ou instale o serviço).",
      );
    } finally {
      setChecking(false);
    }
  }

  async function refreshPrinters() {
    if (!getPrintAgentToken()) return;
    setLoadingList(true);
    setError(null);
    try {
      const data = await fetchPrintAgentPrinters();
      setPrinters(data.printers ?? []);
      setHost(data.host || host);
      setSelected((current) => current || data.printerName || "");
      setOnline(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao listar impressoras.");
      setOnline(false);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await refreshHealth();
      if (getPrintAgentToken()) await refreshPrinters();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = printers.map((item) => ({
    value: item.name,
    label: [
      item.name,
      item.isDefault ? "padrão do Windows" : null,
      item.offline ? "offline" : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  return (
    <Card
      className="overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft [&_.ant-card-body]:max-w-xl"
      title="Impressão do cupom"
      extra={
        online ? (
          <Tag color="success">Agente online</Tag>
        ) : (
          <Tag>Agente offline</Tag>
        )
      }
    >
      <p className="mb-3 text-sm leading-normal text-food-muted">
        A impressão usa um <strong>agente no PC da cozinha</strong> (porta 19100),
        que fala direto com a térmica (ESC/POS). A API na nuvem não acessa a
        impressora.
      </p>

      {error ? (
        <Alert type="warning" showIcon className="mb-3" message={error} />
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          type="primary"
          loading={pairing}
          onClick={async () => {
            setPairing(true);
            setError(null);
            try {
              const paired = await pairPrintAgent();
              toast.success("Agente conectado neste navegador.");
              setOnline(true);
              if (paired.printerName) setSelected(paired.printerName);
              await refreshPrinters();
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Não foi possível conectar. O agente está rodando neste PC?",
              );
              setOnline(false);
            } finally {
              setPairing(false);
            }
          }}
        >
          Conectar agente
        </Button>
        <Button
          icon={<ReloadOutlined />}
          loading={checking || loadingList}
          onClick={async () => {
            await refreshHealth();
            if (getPrintAgentToken()) await refreshPrinters();
          }}
        >
          Atualizar
        </Button>
      </div>

      <p className="mb-3 text-xs text-food-muted">
        {connected
          ? `Conectado em ${getPrintAgentBase()}${host ? ` · ${host}` : ""}`
          : "Ainda não conectado neste navegador."}
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select
          showSearch
          allowClear
          placeholder="Escolha a impressora"
          optionFilterProp="label"
          value={selected || undefined}
          options={options}
          style={{ width: "100%", maxWidth: 420 }}
          disabled={!online || !connected}
          loading={loadingList}
          onChange={(value) => setSelected(value ?? "")}
        />
        <Button
          type="primary"
          disabled={!selected || !online || !connected}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await savePrintAgentPrinter(selected);
              toast.success("Impressora padrão salva no agente.");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Falha ao salvar impressora.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          Salvar impressora
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        message="Instalação no PC da cozinha"
        description={
          <ol className="mb-0 mt-1 list-decimal space-y-1 pl-4 text-sm">
            <li>
              Copie a pasta <code>FoodWpPrint</code> —{" "}
              <strong>não precisa instalar Node</strong>.
            </li>
            <li>
              Execute <code>install.ps1</code>{" "}
              <strong>como Administrador</strong> (instala serviço sem janela).
            </li>
            <li>
              Aqui: <strong>Conectar agente</strong> →{" "}
              <strong>ELGIN i8</strong> → Salvar. Não deixe nenhum exe aberto.
            </li>
          </ol>
        }
      />
    </Card>
  );
}
