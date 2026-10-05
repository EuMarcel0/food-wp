import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.FOOD_WP_PRINT_PORT || 19100);
const DIR =
  process.env.FOOD_WP_PRINT_DIR ||
  join(
    process.env.ProgramData || join(homedir(), ".food-wp"),
    "FoodWpPrint",
  );
const CONFIG_PATH = join(DIR, "config.json");

/**
 * @typedef {{
 *   port: number;
 *   token: string;
 *   printerName: string;
 *   columns: number;
 *   apiBaseUrl: string;
 * }} AgentConfig
 */

/** @returns {AgentConfig} */
export function loadConfig() {
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    /** @type {AgentConfig} */
    const created = {
      port: PORT,
      token: randomBytes(24).toString("hex"),
      printerName: "",
      columns: 48,
      apiBaseUrl: "",
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(created, null, 2), "utf8");
    return created;
  }

  // Bloco de Notas / PowerShell 5 podem salvar com BOM, que quebra o JSON.parse.
  const original = readFileSync(CONFIG_PATH, "utf8");
  const text = original.replace(/^\uFEFF/, "");
  let raw;
  try {
    raw = JSON.parse(text);
    if (text !== original) writeFileSync(CONFIG_PATH, JSON.stringify(raw, null, 2), "utf8");
  } catch (error) {
    // Arquivo corrompido: guarda cópia e recria, preservando o token se der para ler.
    const backup = `${CONFIG_PATH}.bad-${Date.now()}`;
    writeFileSync(backup, original, "utf8");
    const token = /"token"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "";
    const printerName = /"printerName"\s*:\s*"([^"]*)"/.exec(text)?.[1] ?? "";
    const apiBaseUrl = /"apiBaseUrl"\s*:\s*"([^"]*)"/.exec(text)?.[1] ?? "";
    console.error(
      `config.json inválido (${error instanceof Error ? error.message : error}). Cópia em ${backup}; recriando.`,
    );
    const port = Number(/"port"\s*:\s*(\d+)/.exec(text)?.[1]) || PORT;
    raw = { port, token, printerName, columns: 48, apiBaseUrl };
    if (!raw.token) raw.token = randomBytes(24).toString("hex");
    writeFileSync(CONFIG_PATH, JSON.stringify(raw, null, 2), "utf8");
  }
  // 42 era o padrão antigo; 48mm aproveita melhor a Elgin 80mm.
  let columns = Number(raw.columns);
  if (!Number.isFinite(columns) || columns === 42) columns = 48;
  return {
    port: Number(raw.port) || PORT,
    token: String(raw.token || "").trim() || randomBytes(24).toString("hex"),
    printerName: String(raw.printerName || "").trim(),
    columns: Math.min(48, Math.max(32, columns)),
    apiBaseUrl: String(raw.apiBaseUrl || "").trim().replace(/\/$/, ""),
  };
}

/** @param {Partial<AgentConfig>} patch */
export function saveConfig(patch) {
  const current = loadConfig();
  const next = {
    ...current,
    ...patch,
    port: Number(patch.port ?? current.port) || PORT,
    token: String(patch.token ?? current.token).trim(),
    printerName: String(patch.printerName ?? current.printerName).trim(),
    columns: Math.min(
      48,
      Math.max(32, Number(patch.columns ?? current.columns) || 48),
    ),
    apiBaseUrl: String(patch.apiBaseUrl !== undefined ? patch.apiBaseUrl : current.apiBaseUrl)
      .trim()
      .replace(/\/$/, ""),
  };
  mkdirSync(DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function configPaths() {
  return { dir: DIR, configPath: CONFIG_PATH };
}
