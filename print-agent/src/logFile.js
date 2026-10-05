import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { format } from "node:util";

const DIR =
  process.env.FOOD_WP_PRINT_DIR ||
  join(process.env.ProgramData || join(homedir(), ".food-wp"), "FoodWpPrint");
const LOG_PATH = join(DIR, "agent.log");
const MAX_BYTES = 2 * 1024 * 1024;

function write(level, args) {
  try {
    mkdirSync(DIR, { recursive: true });
    try {
      if (statSync(LOG_PATH).size > MAX_BYTES) renameSync(LOG_PATH, `${LOG_PATH}.1`);
    } catch {
      // ainda não existe
    }
    appendFileSync(LOG_PATH, `${new Date().toISOString()} [${level}] ${format(...args)}\n`, "utf8");
  } catch {
    // log nunca derruba o agente
  }
}

const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);
console.log = (...args) => {
  originalLog(...args);
  write("info", args);
};
console.error = (...args) => {
  originalError(...args);
  write("error", args);
};

// Serviço não pode cair por erro pontual (rede, impressora, resposta da API).
process.on("uncaughtException", (error) => {
  console.error("[uncaught]", error instanceof Error ? error.stack || error.message : error);
});
process.on("unhandledRejection", (error) => {
  console.error("[unhandled]", error instanceof Error ? error.stack || error.message : error);
});

console.log(`Agente iniciando (log em ${LOG_PATH})`);
