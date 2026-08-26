import { useQuery } from "@tanstack/react-query";
import { Tooltip } from "antd";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import "./connection-status.css";

function toneOf(whatsapp?: boolean, database?: boolean) {
  if (whatsapp === undefined || database === undefined) return "pending";
  const down = Number(!whatsapp) + Number(!database);
  if (down === 0) return "ok";
  if (down === 1) return "warn";
  return "bad";
}

function labelOf(ok: boolean) {
  return ok ? "conectado" : "fora";
}

export function ConnectionStatus() {
  const { data, isError } = useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
    refetchInterval: 20_000,
  });

  const whatsapp = isError ? false : data?.whatsapp;
  const database = isError ? false : data?.supabase;
  const tone = toneOf(whatsapp, database);
  const title = (
    <div className="connection-tooltip">
      <p>WhatsApp: {whatsapp === undefined ? "verificando" : labelOf(whatsapp)}</p>
      <p>
        Banco de dados:{" "}
        {database === undefined ? "verificando" : labelOf(database)}
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
