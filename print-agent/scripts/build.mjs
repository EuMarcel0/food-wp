import * as esbuild from "esbuild";
import { mkdirSync, cpSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const distDir = join(root, "dist");
const releaseDir = join(root, "release", "FoodWpPrint");
const bundlePath = join(distDir, "agent.cjs");
const exePath = join(releaseDir, "food-wp-print-agent.exe");

/** No Windows o .exe em execução trava o unlink (EPERM). */
function stopRunningAgent() {
  if (process.platform !== "win32") return;
  try {
    execSync(
      'powershell -NoProfile -Command "Get-Process -Name \'food-wp-print-agent\' -ErrorAction SilentlyContinue | Stop-Process -Force"',
      { stdio: "ignore" },
    );
  } catch {
    // já parado
  }
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
    "",
    "1) Clique com o botão direito em install.ps1",
    "2) Execute com PowerShell (como Administrador, se pedir)",
    "3) Abra o painel Food WP neste mesmo PC",
    "4) Configurações → Impressão → Conectar agente",
    "5) Escolha a ELGIN i8 (ou outra) e salve",
    "",
    "Remover: execute uninstall.ps1",
    "",
    "O agente escuta em http://127.0.0.1:19100",
    "",
  ].join("\r\n"),
  "utf8",
);

console.log("");
console.log(`Pacote pronto: ${releaseDir}`);
console.log(`Exe: ${exePath}`);
console.log("");
