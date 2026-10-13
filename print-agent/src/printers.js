import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatTcpPrinter } from "./tcpPrint.js";

const execFileAsync = promisify(execFile);

/**
 * @typedef {{ name: string; isDefault: boolean; offline: boolean; network: boolean; source: "windows" | "ip" }} InstalledPrinter
 */

function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

/** Compartilhada (\\PC\Impressora) ou porta TCP/IP = rede; USB/LPT/virtual = local. */
function isNetworkPrinter(item) {
  if (item.Network) return true;
  const name = String(item.Name ?? "");
  const port = String(item.PortName ?? "");
  return name.startsWith("\\\\") || port.startsWith("\\\\") || /^(IP_|WSD|TCP|\d{1,3}(\.\d{1,3}){3})/i.test(port);
}

/** @returns {Promise<InstalledPrinter[]>} */
export async function listWindowsPrinters() {
  if (process.platform !== "win32") {
    throw new Error("O agente de impressão só lista impressoras no Windows.");
  }

  const command =
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; @(Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default, WorkOffline, Network, PortName) | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command,
    ],
    { timeout: 12000, windowsHide: true, encoding: "utf8" },
  );

  const text = stdout.trim();
  if (!text) return [];

  return asList(JSON.parse(text))
    .map((item) => {
      const name = String(item.Name ?? item.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        isDefault: Boolean(item.Default ?? item.isDefault),
        offline: Boolean(item.WorkOffline ?? item.offline),
        network: isNetworkPrinter(item),
        source: "windows",
      };
    })
    .filter(Boolean);
}

/**
 * Impressoras do Windows (USB, compartilhadas, TCP/IP) + impressoras por IP salvas no agente.
 * @param {{ host: string; port: number }[]} ipPrinters
 * @returns {Promise<InstalledPrinter[]>}
 */
export async function listPrinters(ipPrinters = []) {
  const windows = await listWindowsPrinters();
  const byIp = ipPrinters.map((item) => ({
    name: formatTcpPrinter(item.host, item.port),
    isDefault: false,
    offline: false,
    network: true,
    source: "ip",
  }));
  return [...windows, ...byIp].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    if (left.network !== right.network) return left.network ? 1 : -1;
    return left.name.localeCompare(right.name, "pt-BR");
  });
}
