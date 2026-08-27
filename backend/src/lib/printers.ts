import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type InstalledPrinter = {
  name: string;
  isDefault: boolean;
  offline: boolean;
};

export type PrinterList = {
  host: string;
  printers: InstalledPrinter[];
};

function asList(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return [value as Record<string, unknown>];
}

function mapWindowsPrinters(raw: unknown): InstalledPrinter[] {
  return asList(raw)
    .map((item) => {
      const name = String(item.Name ?? item.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        isDefault: Boolean(item.Default ?? item.isDefault),
        offline: Boolean(item.WorkOffline ?? item.offline),
      };
    })
    .filter((item): item is InstalledPrinter => Boolean(item))
    .sort((left, right) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return left.name.localeCompare(right.name, "pt-BR");
    });
}

async function listWindowsPrinters(): Promise<InstalledPrinter[]> {
  const command =
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; @(Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default, WorkOffline) | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    { timeout: 8000, windowsHide: true, encoding: "utf8" },
  );
  const text = stdout.trim();
  if (!text) return [];
  return mapWindowsPrinters(JSON.parse(text) as unknown);
}

async function listUnixPrinters(): Promise<InstalledPrinter[]> {
  const { stdout } = await execFileAsync("lpstat", ["-a"], {
    timeout: 8000,
    encoding: "utf8",
  });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const name = line.replace(/\s+accepting.+$/i, "").trim();
      return name ? { name, isDefault: false, offline: false } : null;
    })
    .filter((item): item is InstalledPrinter => Boolean(item));
}

export async function listInstalledPrinters(): Promise<PrinterList> {
  const host = hostname();
  try {
    const printers =
      process.platform === "win32"
        ? await listWindowsPrinters()
        : await listUnixPrinters();
    return { host, printers };
  } catch {
    return { host, printers: [] };
  }
}
