import { useEffect, useState } from "react";
import { PlusOutlined, ReloadOutlined, WifiOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, Select, Switch, Tag } from "antd";
import {
  addIpPrinter,
  fetchPrintAgentHealth,
  fetchPrintAgentPrinters,
  getPrintAgentBase,
  getPrintAgentToken,
  isAutoPrintStation,
  pairPrintAgent,
  savePrintAgentPrinter,
  scanNetworkPrinters,
  setAgentAutoPrint,
  setAutoPrintStation,
  tcpPrinterLabel,
  type PrintAgentPrinter
} from "../../lib/printAgent";
import { toast } from "../../lib/toast";
import { cn } from "../../lib/cn";

function printerLabel(item: PrintAgentPrinter) {
  const ip = tcpPrinterLabel(item.name);
  return [
    ip ? `Impressora de rede ${ip}` : item.name,
    item.network ? "rede" : "neste PC",
    item.isDefault ? "padrão do Windows" : null,
    item.offline ? "offline" : null
  ]
    .filter(Boolean)
    .join(" · ");
}

export function PrinterSettingsCard() {
  const [online, setOnline] = useState(false);
  const [host, setHost] = useState("");
  const [checking, setChecking] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [addingIp, setAddingIp] = useState(false);
  const [ipDraft, setIpDraft] = useState("");
  const [savingAuto, setSavingAuto] = useState(false);
  const [printers, setPrinters] = useState<PrintAgentPrinter[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoPrintHere, setAutoPrintHere] = useState(() => isAutoPrintStation());
  const connected = Boolean(getPrintAgentToken());

  async function refreshHealth() {
    setChecking(true);
    setError(null);
    try {
      const health = await fetchPrintAgentHealth();
      setOnline(Boolean(health.ok));
      setHost(health.host || "");
      if (health.printerName) setSelected(health.printerName);
      if (typeof health.autoPrint === "boolean" && getPrintAgentToken()) {
        setAutoPrintStation(health.autoPrint);
        setAutoPrintHere(health.autoPrint);
      }
    } catch {
      setOnline(false);
      setHost("");
      setError("Agente offline. Neste PC, abra o app Food WP Impressão (ícone perto do relógio).");
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
      setSelected(current => current || data.printerName || "");
      setOnline(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao listar impressoras.");
      setOnline(false);
    } finally {
      setLoadingList(false);
    }
  }

  async function searchNetwork() {
    setScanning(true);
    try {
      const { found } = await scanNetworkPrinters();
      const known = new Set(printers.map(item => item.name));
      const fresh = found.filter(item => !known.has(item.name));
      for (const item of fresh) {
        await addIpPrinter(item.host, item.port).catch(() => undefined);
      }
      await refreshPrinters();
      if (!found.length) {
        toast.error(
          "Nenhuma impressora de rede encontrada. Se ela está ligada em outro PC por USB, compartilhe-a no Windows e adicione neste PC."
        );
      } else {
        toast.success(
          fresh.length
            ? `${fresh.length} impressora(s) de rede encontrada(s). Escolha na lista e salve.`
            : "Nenhuma impressora nova: as encontradas já estão na lista."
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao procurar impressoras na rede.");
    } finally {
      setScanning(false);
    }
  }

  async function addByIp() {
    const [hostPart, portPart] = ipDraft.trim().split(":");
    if (!hostPart) return;
    setAddingIp(true);
    try {
      const added = await addIpPrinter(hostPart, Number(portPart) || 9100);
      await refreshPrinters();
      setSelected(added.name);
      setIpDraft("");
      toast.success("Impressora de rede adicionada. Clique em Salvar impressora.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao adicionar a impressora.");
    } finally {
      setAddingIp(false);
    }
  }

  useEffect(() => {
    void (async () => {
      await refreshHealth();
      if (getPrintAgentToken()) await refreshPrinters();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = printers.map(item => ({ value: item.name, label: printerLabel(item) }));
  const disabled = !online || !connected;

  return (
    <Card
      className='overflow-hidden rounded-2xl border border-food-border bg-food-surface shadow-food-soft'
      title='Impressão do cupom'
      extra={online ? <Tag color='success'>Agente online</Tag> : <Tag>Agente offline</Tag>}
    >
      <p className='mb-3 text-sm leading-normal text-food-muted'>
        A impressão usa o <strong>agente de impressão</strong> instalado no PC (porta 19100). No PC da cozinha ele
        busca sozinho os pedidos aceitos — <strong>não precisa</strong> deixar o painel aberto. Em outros PCs, use só
        para imprimir manualmente (botão Imprimir nos pedidos).
      </p>

      {error ? <Alert type='warning' showIcon className='mb-3' message={error} /> : null}

      <div className={cn("mb-3 flex flex-wrap gap-2", error ? "mt-3" : "mb-0")}>
        <Button
          type='primary'
          loading={pairing}
          onClick={async () => {
            setPairing(true);
            setError(null);
            try {
              const paired = await pairPrintAgent();
              setAutoPrintHere(paired.autoPrint);
              toast.success("Agente conectado neste navegador.");
              setOnline(true);
              if (paired.printerName) setSelected(paired.printerName);
              await refreshPrinters();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Não foi possível conectar. O agente está rodando neste PC?"
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

      <p className='mb-3 text-xs text-food-muted'>
        {connected
          ? `Conectado em ${getPrintAgentBase()}${host ? ` · ${host}` : ""}`
          : "Ainda não conectado neste navegador."}
      </p>

      <div className='mb-4 flex items-start justify-between gap-4 rounded-xl border border-food-border bg-food-bg/40 px-3 py-3'>
        <div className='min-w-0'>
          <p className='m-0 text-sm font-semibold text-food-ink'>Imprimir automaticamente neste computador</p>
          <p className='m-0 mt-1 text-xs leading-normal text-food-muted'>
            Ligado = este PC é a estação da cozinha e imprime os pedidos aceitos sozinho. Desligado = este PC
            só imprime quando você clicar em <strong>Imprimir</strong> no pedido. Deixe ligado em um único PC.
          </p>
        </div>
        <Switch
          checked={autoPrintHere}
          disabled={!connected}
          loading={savingAuto}
          onChange={async checked => {
            setSavingAuto(true);
            try {
              if (online) await setAgentAutoPrint(checked);
              setAutoPrintStation(checked);
              setAutoPrintHere(checked);
              toast.success(
                checked
                  ? "Este PC vai imprimir no aceite automático."
                  : "Este PC agora só imprime manualmente."
              );
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao salvar no agente.");
            } finally {
              setSavingAuto(false);
            }
          }}
        />
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <Select
          showSearch
          allowClear
          placeholder='Escolha a impressora'
          optionFilterProp='label'
          value={selected || undefined}
          options={options}
          style={{ width: "100%", maxWidth: 420 }}
          disabled={disabled}
          loading={loadingList}
          onChange={value => setSelected(value ?? "")}
        />
        <Button
          type='primary'
          disabled={!selected || disabled}
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const saved = await savePrintAgentPrinter(selected);
              toast.success(
                saved.queuePolling
                  ? "Impressora salva. O agente vai imprimir os aceites automaticamente."
                  : "Impressora salva para impressão manual neste PC."
              );
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Falha ao salvar impressora.");
            } finally {
              setSaving(false);
            }
          }}
        >
          Salvar impressora
        </Button>
      </div>

      <div className='mt-4 rounded-xl border border-dashed border-food-border px-3 py-3'>
        <p className='m-0 text-sm font-semibold text-food-ink'>Impressora na rede</p>
        <p className='m-0 mt-1 text-xs leading-normal text-food-muted'>
          Impressoras compartilhadas ou instaladas no Windows já aparecem na lista acima (marcadas como “rede”).
          Térmicas ligadas no roteador/cabo de rede podem ser encontradas aqui pelo IP.
        </p>
        <div className='mt-2.5 flex flex-wrap items-center gap-2'>
          <Button icon={<WifiOutlined />} loading={scanning} disabled={disabled} onClick={() => void searchNetwork()}>
            Procurar na rede
          </Button>
          <Input
            className='!w-full sm:!w-[200px]'
            placeholder='IP (ex.: 192.168.0.50)'
            value={ipDraft}
            disabled={disabled}
            onChange={event => setIpDraft(event.target.value)}
            onPressEnter={() => void addByIp()}
          />
          <Button
            icon={<PlusOutlined />}
            loading={addingIp}
            disabled={disabled || !ipDraft.trim()}
            onClick={() => void addByIp()}
          >
            Adicionar por IP
          </Button>
        </div>
      </div>
    </Card>
  );
}
