import { spawn } from "node:child_process";

/**
 * Alerta sonoro na estação da cozinha (Windows).
 * Usa Console.Beep — funciona no serviço sem depender do navegador.
 */
export function playKitchenPrintAlert() {
  if (process.platform !== "win32") return;
  try {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        [
          "[console]::beep(980,180)",
          "[console]::beep(1310,200)",
          "[console]::beep(1560,280)",
          "[console]::beep(1310,180)",
          "[console]::beep(1760,420)",
        ].join(";"),
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
  } catch (error) {
    console.error(
      "[print-alert]",
      error instanceof Error ? error.message : error,
    );
  }
}
