import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Envia bytes raw (ESC/POS) para a fila da impressora no Windows.
 * @param {string} printerName
 * @param {Buffer} data
 */
export async function rawPrintWindows(printerName, data) {
  if (process.platform !== "win32") {
    throw new Error("Impressão raw só está disponível no Windows.");
  }
  const name = printerName.trim();
  if (!name) throw new Error("Informe o nome da impressora.");

  const dir = mkdtempSync(join(tmpdir(), "food-wp-print-"));
  const binPath = join(dir, "ticket.bin");
  const psPath = join(dir, "print.ps1");
  writeFileSync(binPath, data);

  const script = `
$ErrorActionPreference = 'Stop'
$printerName = ${JSON.stringify(name)}
$filePath = ${JSON.stringify(binPath)}

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class FoodWpRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static void SendBytes(string printer, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) {
      throw new Exception("Não foi possível abrir a impressora: " + printer);
    }
    try {
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "Food WP Cupom";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) {
        throw new Exception("StartDocPrinter falhou.");
      }
      try {
        if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter falhou.");
        try {
          IntPtr pUnmanaged = Marshal.AllocCoTaskMem(bytes.Length);
          try {
            Marshal.Copy(bytes, 0, pUnmanaged, bytes.Length);
            int written;
            if (!WritePrinter(hPrinter, pUnmanaged, bytes.Length, out written)) {
              throw new Exception("WritePrinter falhou.");
            }
          } finally {
            Marshal.FreeCoTaskMem(pUnmanaged);
          }
        } finally {
          EndPagePrinter(hPrinter);
        }
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
"@

$bytes = [System.IO.File]::ReadAllBytes($filePath)
[FoodWpRawPrinter]::SendBytes($printerName, $bytes)
`;

  writeFileSync(psPath, script, "utf8");

  try {
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        psPath,
      ],
      { timeout: 30000, windowsHide: true, encoding: "utf8" },
    );
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr || error.message || error)
        : String(error);
    throw new Error(`Falha ao imprimir em "${name}": ${detail.trim()}`);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  }
}
