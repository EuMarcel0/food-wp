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
      columns: 42,
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(created, null, 2), "utf8");
    return created;
  }

  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  return {
    port: Number(raw.port) || PORT,
    token: String(raw.token || "").trim() || randomBytes(24).toString("hex"),
    printerName: String(raw.printerName || "").trim(),
    columns: Math.min(48, Math.max(32, Number(raw.columns) || 42)),
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
      Math.max(32, Number(patch.columns ?? current.columns) || 42),
    ),
  };
  mkdirSync(DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function configPaths() {
  return { dir: DIR, configPath: CONFIG_PATH };
}
