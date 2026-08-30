import * as esbuild from "esbuild";
import {
  mkdirSync,
  cpSync,
  writeFileSync,
  rmSync,
  existsSync,
  createWriteStream,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "dist");
const releaseDir = join(root, "release", "FoodWpPrint");
const vendorDir = join(root, "vendor");
const bundlePath = join(distDir, "agent.cjs");
const exePath = join(releaseDir, "food-wp-print-agent.exe");
const winswUrl =
  "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe";
const winswCache = join(vendorDir, "WinSW-x64.exe");

/** No Windows o .exe em execução trava o unlink (EPERM). */
function stopRunningAgent() {
  if (process.platform !== "win32") return;
  try {
    execSync(
      'powershell -NoProfile -Command "Get-Process -Name \'food-wp-print-agent\',\'FoodWpPrint\' -ErrorAction SilentlyContinue | Stop-Process -Force; if (Get-Service -Name FoodWpPrint -ErrorAction SilentlyContinue) { Stop-Service FoodWpPrint -Force -ErrorAction SilentlyContinue }"',
      { stdio: "ignore" },
    );
  } catch {
    // já parado
  }
}

async function ensureWinSW() {
  mkdirSync(vendorDir, { recursive: true });
  if (existsSync(winswCache)) return winswCache;
  console.log("Baixando WinSW (wrapper de serviço Windows)...");
  const response = await fetch(winswUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar WinSW: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(winswCache));
  return winswCache;
}

function removeDir(path) {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EPERM") {
      throw new Error(
        `Não foi possível apagar ${path}. Feche o food-wp-print-agent.exe (ou encerre a tarefa FoodWpPrintAgent) e rode de novo: npm run build:exe`,
      );
    }
    throw error;
  }
}

stopRunningAgent();
removeDir(distDir);
removeDir(releaseDir);
mkdirSync(distDir, { recursive: true });
mkdirSync(releaseDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "src", "index.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: bundlePath,
  legalComments: "none",
  logLevel: "info",
});

const pkgBin = join(root, "node_modules", "@yao-pkg", "pkg", "lib-es5", "bin.js");
const pkgCli = existsSync(pkgBin)
  ? pkgBin
  : join(root, "..", "node_modules", "@yao-pkg", "pkg", "lib-es5", "bin.js");

execFileSync(
  process.execPath,
  [
    pkgCli,
    bundlePath,
    "--targets",
    "node20-win-x64",
    "--output",
    exePath,
    "--compress",
    "GZip",
  ],
  { stdio: "inherit", cwd: root },
);

const winswPath = await ensureWinSW();
cpSync(winswPath, join(releaseDir, "FoodWpPrint.exe"));
cpSync(join(root, "service", "FoodWpPrint.xml"), join(releaseDir, "FoodWpPrint.xml"));
cpSync(join(root, "scripts", "install.ps1"), join(releaseDir, "install.ps1"));
cpSync(
  join(root, "scripts", "uninstall.ps1"),
  join(releaseDir, "uninstall.ps1"),
);

writeFileSync(
  join(releaseDir, "LEIA-ME.txt"),
  [
    "Food WP · Agente de impressão",
    "",
    "Não precisa instalar Node.js neste computador.",
    "O agente roda como SERVICO do Windows (sem janela).",
    "",
    "1) Clique com o botão direito em install.ps1",
    "2) Executar com PowerShell como Administrador",
    "3) Abra o painel Food WP neste mesmo PC",
    "4) Configurações → Impressão → Conectar agente",
    "5) Escolha a ELGIN i8 (ou outra) e salve",
    "",
    "Depois disso não precisa deixar nenhum programa aberto.",
    "O serviço sobe sozinho com o Windows.",
    "",
    "Remover: execute uninstall.ps1 como Administrador",
    "Ver status: services.msc → Food WP Print Agent",
    "",
    "O agente escuta em http://127.0.0.1:19100",
    "",
  ].join("\r\n"),
  "utf8",
);

console.log("");
console.log(`Pacote pronto: ${releaseDir}`);
console.log(`Exe: ${exePath}`);
console.log("Servico: FoodWpPrint.exe + FoodWpPrint.xml (WinSW)");
console.log("");
