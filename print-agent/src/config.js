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
 *   printMode: "image" | "text";
 *   fontScale: number;
 *   autoPrint: boolean;
 *   ipPrinters: { host: string; port: number }[];
 * }} AgentConfig
 */

/** Sem o campo (instalações antigas) = estação da cozinha, que já imprimia sozinha. */
function parseAutoPrint(value) {
  return value === undefined || value === null ? true : Boolean(value);
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function parseIpPrinters(value) {
  const seen = new Set();
  const list = [];
  for (const item of Array.isArray(value) ? value : []) {
    const host = String(item?.host || "").trim();
    const port = Math.min(65535, Math.max(1, Number(item?.port) || 9100));
    const key = `${host}:${port}`;
    if (!IPV4.test(host) || seen.has(key)) continue;
    seen.add(key);
    list.push({ host, port });
  }
  return list.slice(0, 20);
}

/** image = igual à prévia do painel; text = ESC/POS em texto (impressoras que não aceitam imagem). */
function parsePrintMode(value) {
  return value === "text" ? "text" : "image";
}

const DEFAULT_FONT_SCALE = 1.5;

/** Tamanho da letra no cupom em imagem, relativo à prévia do painel (1 = igual à tela). */
function parseFontScale(value) {
  const scale = Number(value);
  // 1.3 era o padrão anterior: sobe junto com o novo padrão.
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1.3) return DEFAULT_FONT_SCALE;
  return Math.min(2, Math.max(0.8, scale));
}

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
      printMode: "image",
      fontScale: DEFAULT_FONT_SCALE,
      autoPrint: true,
      ipPrinters: [],
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
    printMode: parsePrintMode(raw.printMode),
    fontScale: parseFontScale(raw.fontScale),
    autoPrint: parseAutoPrint(raw.autoPrint),
    ipPrinters: parseIpPrinters(raw.ipPrinters),
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
    printMode: parsePrintMode(patch.printMode ?? current.printMode),
    fontScale: parseFontScale(patch.fontScale ?? current.fontScale),
    autoPrint: parseAutoPrint(patch.autoPrint ?? current.autoPrint),
    ipPrinters: parseIpPrinters(patch.ipPrinters ?? current.ipPrinters),
  };
  mkdirSync(DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function configPaths() {
  return { dir: DIR, configPath: CONFIG_PATH };
}
