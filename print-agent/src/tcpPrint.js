import { Socket } from "node:net";
import { networkInterfaces } from "node:os";

/** Porta RAW/JetDirect das térmicas de rede (Elgin, Epson, Bematech...). */
export const RAW_PORT = 9100;
const PREFIX = "tcp://";
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function isValidIpv4(value) {
  return IPV4.test(String(value || "").trim());
}

export function formatTcpPrinter(host, port = RAW_PORT) {
  return `${PREFIX}${host}:${Number(port) || RAW_PORT}`;
}

/** "tcp://192.168.0.50:9100" → { host, port }; nomes de impressora do Windows → null. */
export function parseTcpPrinter(name) {
  const value = String(name || "").trim();
  if (!value.toLowerCase().startsWith(PREFIX)) return null;
  const [host, rawPort] = value.slice(PREFIX.length).split(":");
  if (!isValidIpv4(host)) return null;
  const port = Number(rawPort) || RAW_PORT;
  return { host, port };
}

/**
 * Envia bytes ESC/POS direto para a impressora de rede (sem driver do Windows).
 * @param {{ host: string; port: number }} target
 * @param {Buffer} data
 */
export function sendTcp(target, data, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () =>
      finish(new Error(`Impressora de rede ${target.host}:${target.port} não respondeu.`)),
    );
    socket.once("error", (error) =>
      finish(new Error(`Falha ao imprimir em ${target.host}:${target.port}: ${error.message}`)),
    );
    socket.connect(target.port, target.host, () => {
      socket.end(data, () => finish());
    });
  });
}

export function isTcpReachable(host, port = RAW_PORT, timeoutMs = 1500) {
  return probe(host, port, timeoutMs);
}

function probe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

/** Redes IPv4 locais (/24 do IP de cada placa de rede). */
function localSubnets() {
  const subnets = new Map();
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== "IPv4" || item.internal) continue;
      if (item.address.startsWith("169.254.")) continue;
      const base = item.address.split(".").slice(0, 3).join(".");
      subnets.set(base, item.address);
    }
  }
  return [...subnets.entries()].map(([base, self]) => ({ base, self }));
}

/**
 * Procura impressoras com a porta 9100 aberta na rede local.
 * @returns {Promise<{ host: string; port: number }[]>}
 */
export async function scanNetworkPrinters({ port = RAW_PORT, timeoutMs = 400, concurrency = 64 } = {}) {
  const hosts = [];
  for (const { base, self } of localSubnets()) {
    for (let last = 1; last <= 254; last += 1) {
      const host = `${base}.${last}`;
      if (host !== self) hosts.push(host);
    }
  }
  const found = [];
  let index = 0;
  const worker = async () => {
    while (index < hosts.length) {
      const host = hosts[index];
      index += 1;
      if (await probe(host, port, timeoutMs)) found.push({ host, port });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  return found.sort((left, right) =>
    left.host.localeCompare(right.host, undefined, { numeric: true }),
  );
}
