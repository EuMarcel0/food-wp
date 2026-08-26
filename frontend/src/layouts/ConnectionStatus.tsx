import { useEffect, useState } from "react";
import { Tooltip } from "antd";
import { api } from "../lib/api";
import "./connection-status.css";

type HealthFlags = {
  whatsapp: boolean;
  database: boolean;
};

function toneOf(flags: HealthFlags | null) {
  if (!flags) return "pending";
  const down = Number(!flags.whatsapp) + Number(!flags.database);
  if (down === 0) return "ok";
  if (down === 1) return "warn";
  return "bad";
}

function labelOf(ok: boolean) {
  return ok ? "conectado" : "fora";
}

export function ConnectionStatus() {
  const [flags, setFlags] = useState<HealthFlags | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const health = await api.health();
        if (!active) return;
        setFlags({
          whatsapp: health.whatsapp,
          database: health.supabase,
        });
      } catch {
        if (!active) return;
        setFlags({ whatsapp: false, database: false });
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 20000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const tone = toneOf(flags);
  const title = (
    <div className="connection-tooltip">
      <p>
        WhatsApp: {flags ? labelOf(flags.whatsapp) : "verificando"}
      </p>
      <p>
        Banco de dados: {flags ? labelOf(flags.database) : "verificando"}
      </p>
      <ul>
        <li>Verde: os dois ok</li>
        <li>Laranja: um fora</li>
        <li>Vermelho: os dois fora</li>
      </ul>
    </div>
  );

  return (
    <Tooltip title={title} placement="bottomRight">
      <button
        type="button"
        className="connection-status"
        aria-label="Status das conexões"
      >
        <span className={`connection-dot is-${tone}`} />
      </button>
    </Tooltip>
  );
}
