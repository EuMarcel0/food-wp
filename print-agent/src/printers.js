import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * @typedef {{ name: string; isDefault: boolean; offline: boolean }} InstalledPrinter
 */

function asList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

/** @returns {Promise<InstalledPrinter[]>} */
export async function listPrinters() {
  if (process.platform !== "win32") {
    throw new Error("O agente de impressão só lista impressoras no Windows.");
  }

  const command =
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; @(Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default, WorkOffline) | ConvertTo-Json -Compress";
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
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return left.name.localeCompare(right.name, "pt-BR");
    });
}
