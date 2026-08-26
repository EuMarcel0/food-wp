import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, List, Tag, Typography } from "antd";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";

const backendVars = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "DEFAULT_STORE_ID",
];

const frontendVars = [
  "VITE_API_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
];

export function SettingsPage() {
  const { data: health } = useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
  });
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Configurações
      </Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Preencha os arquivos .env a partir dos .env.example. Nada de credencial real foi commitado."
      />
      <Card title="Instalar o app" style={{ marginBottom: 16 }}>
        <Typography.Paragraph type="secondary">
          O painel é um PWA. No celular, use “Adicionar à tela inicial”. No
          desktop, o Chrome/Edge mostram o ícone de instalar na barra.
        </Typography.Paragraph>
        <Button
          type="primary"
          disabled={!installEvent}
          onClick={async () => {
            if (!installEvent) return;
            await installEvent.prompt();
            setInstallEvent(null);
          }}
        >
          {installEvent ? "Instalar neste dispositivo" : "Aguardando o navegador"}
        </Button>
      </Card>
      <Card title="Status da API" style={{ marginBottom: 16 }}>
        <Tag color={health?.ok ? "green" : "red"}>
          API {health?.ok ? "online" : "offline"}
        </Tag>
        <Tag color={health?.supabase ? "green" : "orange"}>
          Supabase {health?.supabase ? "ok" : "pendente"}
        </Tag>
        <Tag color={health?.whatsapp ? "green" : "orange"}>
          WhatsApp {health?.whatsapp ? "ok" : "pendente"}
        </Tag>
      </Card>
      <Card title="backend/.env" style={{ marginBottom: 16 }}>
        <List
          dataSource={backendVars}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      </Card>
      <Card title="frontend/.env">
        <List
          dataSource={frontendVars}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      </Card>
    </>
  );
}
