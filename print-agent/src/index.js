import cors from "cors";
import express from "express";
import { hostname } from "node:os";
import { configPaths, loadConfig, saveConfig } from "./config.js";
import { listPrinters } from "./printers.js";
import { rawPrintWindows } from "./rawPrint.js";
import { buildReceiptEscPos } from "./receipt.js";

const config = loadConfig();
const app = express();
const paths = configPaths();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

function auth(req, res, next) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : String(req.headers["x-print-token"] || "").trim();
  if (!token || token !== config.token) {
    res.status(401).json({
      error: "Token inválido. Abra Configurações e conecte ao agente de impressão.",
    });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "food-wp-print-agent",
    host: hostname(),
    port: config.port,
    printerName: config.printerName || null,
    columns: config.columns,
  });
});

/** Entrega o token só em localhost (pairing do painel). */
app.get("/setup", (req, res) => {
  const ip = req.socket.remoteAddress || "";
  const local =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1";
  if (!local) {
    res.status(403).json({ error: "Setup só é permitido em localhost." });
    return;
  }
  res.json({
    ok: true,
    token: config.token,
    port: config.port,
    printerName: config.printerName || null,
    columns: config.columns,
    configPath: paths.configPath,
  });
});

app.get("/printers", auth, async (_req, res) => {
  try {
    const printers = await listPrinters();
    res.json({
      host: hostname(),
      printerName: config.printerName || null,
      printers,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao listar impressoras.",
    });
  }
});

app.put("/config", auth, (req, res) => {
  const body = req.body ?? {};
  const next = saveConfig({
    printerName:
      body.printerName !== undefined
        ? String(body.printerName || "")
        : config.printerName,
    columns:
      body.columns !== undefined ? Number(body.columns) : config.columns,
  });
  Object.assign(config, next);
  res.json({
    ok: true,
    printerName: config.printerName || null,
    columns: config.columns,
  });
});

app.post("/print", auth, async (req, res) => {
  try {
    const body = req.body ?? {};
    const order = body.order;
    if (!order || typeof order !== "object" || !order.code) {
      res.status(400).json({ error: "Envie o pedido em order." });
      return;
    }
    const printerName = String(body.printer || config.printerName || "").trim();
    if (!printerName) {
      res.status(400).json({
        error: "Nenhuma impressora configurada. Escolha uma em Configurações.",
      });
      return;
    }

    const columns =
      body.columns !== undefined
        ? Math.min(48, Math.max(32, Number(body.columns) || 48))
        : config.columns;
    const buffer = buildReceiptEscPos({
      store: body.store,
      order,
      columns,
    });
    await rawPrintWindows(printerName, buffer);
    res.json({ ok: true, printer: printerName, bytes: buffer.length });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao imprimir.",
    });
  }
});

app.listen(config.port, "127.0.0.1", () => {
  console.log("");
  console.log("Food WP · Agente de impressão");
  console.log(`  URL:     http://127.0.0.1:${config.port}`);
  console.log(`  Config:  ${paths.configPath}`);
  console.log(`  Token:   ${config.token}`);
  console.log(
    `  Printer: ${config.printerName || "(não definida — use o painel)"}`,
  );
  console.log("");
  console.log("No painel: Configurações → Impressão → Conectar agente");
  console.log("");
});
