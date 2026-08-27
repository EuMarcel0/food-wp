import { useQuery } from "@tanstack/react-query";
import { Tooltip } from "antd";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/cn";

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

const DOT: Record<string, string> = {
  pending: "bg-food-muted",
  ok: "bg-green-500 shadow-[0_0_0_4px_rgba(34,197,94,0.18)] animate-pulse-dot motion-reduce:animate-none",
  warn: "bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.22)] animate-bounce-dot motion-reduce:animate-none",
  bad: "bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.22)] animate-bounce-dot-fast motion-reduce:animate-none",
};

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
    <div className="flex flex-col gap-1.5 [&_p]:m-0 [&_p]:text-xs [&_p]:leading-snug [&_li]:m-0 [&_li]:text-xs [&_li]:leading-snug [&_ul]:mt-1 [&_ul]:mb-0 [&_ul]:pl-4">
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
        className="grid size-9 cursor-default place-items-center border-0 bg-transparent p-0"
        aria-label="Status das conexões"
      >
        <span className={cn("size-2.5 rounded-full", DOT[tone])} />
      </button>
    </Tooltip>
  );
}
