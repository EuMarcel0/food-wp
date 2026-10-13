import "./logFile.js";
import cors from "cors";
import express from "express";
import { hostname } from "node:os";
import { configPaths, loadConfig, saveConfig } from "./config.js";
import { listPrinters } from "./printers.js";
import { isQueuePolling, refreshPrintQueuePoller } from "./printQueue.js";
import {
  formatTcpPrinter,
  isTcpReachable,
  isValidIpv4,
  RAW_PORT,
  scanNetworkPrinters,
} from "./tcpPrint.js";
import { printReceipt } from "./printReceipt.js";
import { rawPrintWindows } from "./rawPrint.js";
import { buildSalesByPaymentEscPos } from "./salesReport.js";

const config = loadConfig();
const app = express();
const paths = configPaths();

/** Uma impressão por vez — abas/PCs concorrentes não brigam pelo spooler. */
let printChain = Promise.resolve();
function enqueuePrint(task) {
  const run = printChain.then(task, task);
  printChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

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
    printMode: config.printMode,
    fontScale: config.fontScale,
    apiBaseUrl: config.apiBaseUrl || null,
    autoPrint: config.autoPrint,
    queuePolling: isQueuePolling(config),
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
    apiBaseUrl: config.apiBaseUrl || null,
    autoPrint: config.autoPrint,
    configPath: paths.configPath,
  });
});

app.get("/printers", auth, async (_req, res) => {
  try {
    const printers = await listPrinters(config.ipPrinters);
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

/** Procura térmicas de rede (porta 9100) na rede local deste PC. */
app.get("/printers/scan", auth, async (_req, res) => {
  try {
    const found = await scanNetworkPrinters();
    res.json({
      found: found.map((item) => ({ ...item, name: formatTcpPrinter(item.host, item.port) })),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao procurar impressoras na rede.",
    });
  }
});

/** Adiciona uma impressora de rede pelo IP (testa a conexão antes de salvar). */
app.post("/printers/ip", auth, async (req, res) => {
  const host = String(req.body?.host || "").trim();
  const port = Math.min(65535, Math.max(1, Number(req.body?.port) || RAW_PORT));
  if (!isValidIpv4(host)) {
    res.status(400).json({ error: "Informe um IP válido (ex.: 192.168.0.50)." });
    return;
  }
  if (!(await isTcpReachable(host, port))) {
    res.status(400).json({
      error: `Nenhuma impressora respondeu em ${host}:${port}. Confira o IP e se ela está ligada na mesma rede.`,
    });
    return;
  }
  const next = saveConfig({ ipPrinters: [...config.ipPrinters, { host, port }] });
  Object.assign(config, next);
  res.json({ ok: true, name: formatTcpPrinter(host, port) });
});

app.delete("/printers/ip", auth, (req, res) => {
  const host = String(req.body?.host ?? req.query.host ?? "").trim();
  const port = Number(req.body?.port ?? req.query.port) || RAW_PORT;
  const next = saveConfig({
    ipPrinters: config.ipPrinters.filter((item) => item.host !== host || item.port !== port),
  });
  Object.assign(config, next);
  res.json({ ok: true });
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
    apiBaseUrl:
      body.apiBaseUrl !== undefined
        ? String(body.apiBaseUrl || "")
        : config.apiBaseUrl,
    printMode: body.printMode !== undefined ? String(body.printMode) : config.printMode,
    fontScale: body.fontScale !== undefined ? Number(body.fontScale) : config.fontScale,
    autoPrint: body.autoPrint !== undefined ? Boolean(body.autoPrint) : config.autoPrint,
  });
  Object.assign(config, next);
  refreshPrintQueuePoller(enqueuePrint);
  res.json({
    ok: true,
    printerName: config.printerName || null,
    columns: config.columns,
    apiBaseUrl: config.apiBaseUrl || null,
    autoPrint: config.autoPrint,
    queuePolling: isQueuePolling(config),
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
    const result = await enqueuePrint(async () => {
      const printed = await printReceipt(printerName, {
        store: body.store,
        order,
        columns,
        mode: config.printMode,
        fontScale: config.fontScale,
      });
      return { ok: true, printer: printerName, mode: printed.mode };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao imprimir.",
    });
  }
});

app.post("/print-report", auth, async (req, res) => {
  try {
    const body = req.body ?? {};
    const type = String(body.type || "").trim();
    if (type !== "sales-by-payment") {
      res.status(400).json({ error: "Tipo de relatório inválido." });
      return;
    }
    if (!body.report || typeof body.report !== "object") {
      res.status(400).json({ error: "Envie o relatório em report." });
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
    const buffer = buildSalesByPaymentEscPos({
      store: body.store,
      report: body.report,
      columns,
    });
    const result = await enqueuePrint(async () => {
      await rawPrintWindows(printerName, buffer);
      return { ok: true, printer: printerName, bytes: buffer.length };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao imprimir relatório.",
    });
  }
});

const server = app.listen(config.port, "127.0.0.1", () => {
  console.log("");
  console.log("Food WP · Agente de impressão");
  console.log(`  URL:     http://127.0.0.1:${config.port}`);
  console.log(`  Config:  ${paths.configPath}`);
  console.log(`  Token:   ${config.token}`);
  console.log(
    `  Printer: ${config.printerName || "(não definida — use o painel)"}`,
  );
  console.log(`  API:     ${config.apiBaseUrl || "(não configurada)"}`);
  console.log("");
  console.log("No painel: Configurações → Impressão → Conectar agente");
  console.log("");
  refreshPrintQueuePoller(enqueuePrint);
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(
      `Porta ${config.port} já está em uso. Feche a outra instância do agente (npm start / tarefa agendada) e inicie o serviço de novo.`,
    );
  } else {
    console.error("Falha ao abrir o servidor:", error);
  }
  process.exit(1);
});
