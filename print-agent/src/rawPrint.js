import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { parseTcpPrinter, sendTcp } from "./tcpPrint.js";

const execFileAsync = promisify(execFile);

const RAW_PRINTER_CS = `
using System;
using System.IO;
using System.Runtime.InteropServices;

public class FoodWpRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

  static string LastError() {
    int code = Marshal.GetLastWin32Error();
    return new System.ComponentModel.Win32Exception(code).Message + " (código " + code + ")";
  }

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
      throw new Exception("Não foi possível abrir a impressora " + printer + ": " + LastError());
    }
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = "Food WP Cupom";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) {
        throw new Exception("A impressora recusou o trabalho: " + LastError());
      }
      try {
        if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter falhou: " + LastError());
        try {
          IntPtr pUnmanaged = Marshal.AllocCoTaskMem(bytes.Length);
          try {
            Marshal.Copy(bytes, 0, pUnmanaged, bytes.Length);
            int written;
            if (!WritePrinter(hPrinter, pUnmanaged, bytes.Length, out written)) {
              throw new Exception("Falha ao enviar o cupom para a impressora: " + LastError());
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
`;

/**
 * Desenha o cupom (blocos de receiptLayout.js) com System.Drawing e converte em
 * imagem ESC/POS (GS v 0). C# 5: é o compilador do Add-Type no PowerShell 5.1.
 */
const RECEIPT_RENDERER_CS = `
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;

public class FoodWpReceiptRenderer {
  const float SCREEN_WIDTH = 302f;
  const float SCREEN_PADDING = 8f;
  const float LINE_HEIGHT = 1.35f;

  int width;
  float scale;
  /** Letras: escala da tela × fontScale (o papel lido de longe pede letra maior que a prévia). */
  float textScale;
  float pad;
  string family;
  Graphics g;
  StringFormat fmt;
  bool draw;
  float y;
  Dictionary<string, Font> fonts = new Dictionary<string, Font>();

  Font FontFor(float size, bool bold) {
    string key = size + (bold ? "b" : "r");
    Font font;
    if (!fonts.TryGetValue(key, out font)) {
      font = new Font(family, size * textScale, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel);
      fonts[key] = font;
    }
    return font;
  }

  float Measure(string text, Font font) {
    if (string.IsNullOrEmpty(text)) return 0f;
    return g.MeasureString(text, font, PointF.Empty, fmt).Width;
  }

  List<string> Wrap(string text, Font font, float firstWidth, float width) {
    List<string> lines = new List<string>();
    string current = "";
    float limit = firstWidth;
    foreach (string word in text.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries)) {
      string next = current.Length == 0 ? word : current + " " + word;
      if (Measure(next, font) <= limit) { current = next; continue; }
      if (current.Length > 0) { lines.Add(current); limit = width; current = ""; }
      string piece = word;
      while (Measure(piece, font) > limit && piece.Length > 1) {
        int cut = piece.Length - 1;
        while (cut > 1 && Measure(piece.Substring(0, cut), font) > limit) cut--;
        lines.Add(piece.Substring(0, cut));
        limit = width;
        piece = piece.Substring(cut);
      }
      current = piece;
    }
    if (current.Length > 0 || lines.Count == 0) lines.Add(current);
    return lines;
  }

  void Text(string text, Font font, float x, float top) {
    if (draw && text.Length > 0) g.DrawString(text, font, Brushes.Black, x, top, fmt);
  }

  void Dashes(float x1, float x2, float top, float dash, float gap, float thickness) {
    if (!draw) return;
    for (float x = x1; x < x2; x += dash + gap) {
      g.FillRectangle(Brushes.Black, x, top, Math.Min(dash, x2 - x), thickness);
    }
  }

  void Row(string line) {
    string[] p = line.Split('\\t');
    if (p.Length < 10) return;
    string kind = p[0];
    float size = float.Parse(p[1], System.Globalization.CultureInfo.InvariantCulture);
    bool bold = p[2] == "1";
    string align = p[3];
    float indent = float.Parse(p[4], System.Globalization.CultureInfo.InvariantCulture) * scale;
    string text = p[5];
    string right = p[6];
    bool rightBold = p[7] == "1";
    y += float.Parse(p[8], System.Globalization.CultureInfo.InvariantCulture) * scale;
    float after = float.Parse(p[9], System.Globalization.CultureInfo.InvariantCulture) * scale;

    float lh = size * textScale * LINE_HEIGHT;
    float avail = width - 2 * pad - indent;
    float thin = Math.Max(1f, (float)Math.Round(scale));
    Font font = FontFor(size, bold);

    if (kind == "V") {
      y += size * scale;
    } else if (kind == "R") {
      Dashes(pad, width - pad, y, 3 * scale, 2 * scale, thin);
      y += thin;
    } else if (kind == "T") {
      foreach (string l in Wrap(text, font, avail, avail)) {
        float x = align == "center" ? (width - Measure(l, font)) / 2f : pad + indent;
        Text(l, font, x, y);
        y += lh;
      }
    } else if (kind == "F") {
      Font labelFont = FontFor(size, true);
      Font valueFont = FontFor(size, false);
      string label = text + ": ";
      float labelWidth = Measure(label, labelFont);
      Text(label, labelFont, pad + indent, y);
      List<string> lines = Wrap(right, valueFont, avail - labelWidth, avail);
      for (int i = 0; i < lines.Count; i++) {
        Text(lines[i], valueFont, i == 0 ? pad + indent + labelWidth : pad + indent, y);
        y += lh;
      }
    } else if (kind == "S") {
      float textWidth = Measure(text, font);
      float left = (width - textWidth) / 2f;
      float mid = y + lh / 2f;
      float gap = 8 * scale;
      Dashes(pad, left - gap, mid, 3 * scale, 2 * scale, thin);
      Dashes(left + textWidth + gap, width - pad, mid, 3 * scale, 2 * scale, thin);
      Text(text, font, left, y);
      y += lh;
    } else if (kind == "L") {
      Font rightFont = FontFor(size, rightBold);
      float rightWidth = Measure(right, rightFont);
      float minLeader = 12 * scale;
      List<string> lines = Wrap(text, font, avail - rightWidth - minLeader, avail - rightWidth - minLeader);
      for (int i = 0; i < lines.Count; i++) {
        Text(lines[i], font, pad + indent, y);
        if (i == lines.Count - 1) {
          float leftEnd = pad + indent + Measure(lines[i], font);
          float rightX = width - pad - rightWidth;
          float baseline = y + size * textScale * 1.08f;
          for (float x = leftEnd + 4 * scale; x < rightX - 4 * scale; x += 3 * scale) {
            if (draw) g.FillRectangle(Brushes.Black, x, baseline, thin, thin);
          }
          Text(right, rightFont, rightX, y);
        }
        y += lh;
      }
    }
    y += after;
  }

  float Layout(string[] rows) {
    y = 0;
    foreach (string line in rows) Row(line);
    return y;
  }

  public static byte[] Render(string[] rows, int width, string family, float fontScale, string pngPath) {
    FoodWpReceiptRenderer r = new FoodWpReceiptRenderer();
    r.width = width;
    r.scale = width / SCREEN_WIDTH;
    r.textScale = r.scale * fontScale;
    r.pad = SCREEN_PADDING * r.scale;
    try { using (FontFamily test = new FontFamily(family)) { r.family = family; } }
    catch { r.family = "Arial"; }
    r.fmt = (StringFormat)StringFormat.GenericTypographic.Clone();
    r.fmt.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces;

    float height;
    using (Bitmap probe = new Bitmap(width, 10))
    using (Graphics pg = Graphics.FromImage(probe)) {
      pg.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
      r.g = pg;
      r.draw = false;
      height = r.Layout(rows);
    }

    int h = Math.Max(8, (int)Math.Ceiling(height));
    using (Bitmap bmp = new Bitmap(width, h, PixelFormat.Format32bppArgb)) {
      using (Graphics dg = Graphics.FromImage(bmp)) {
        dg.Clear(Color.White);
        dg.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        r.g = dg;
        r.draw = true;
        r.Layout(rows);
      }
      if (!string.IsNullOrEmpty(pngPath)) SaveMonochrome(bmp, pngPath);
      return ToEscPos(bmp);
    }
  }

  const int THRESHOLD = 150;

  static bool IsInk(Color c) {
    return (c.R * 299 + c.G * 587 + c.B * 114) / 1000 < THRESHOLD;
  }

  /** Prévia exatamente como sai na térmica (só preto e branco). */
  static void SaveMonochrome(Bitmap bmp, string path) {
    using (Bitmap mono = new Bitmap(bmp.Width, bmp.Height)) {
      for (int yy = 0; yy < bmp.Height; yy++)
        for (int x = 0; x < bmp.Width; x++)
          mono.SetPixel(x, yy, IsInk(bmp.GetPixel(x, yy)) ? Color.Black : Color.White);
      mono.Save(path, ImageFormat.Png);
    }
  }

  static byte[] ToEscPos(Bitmap bmp) {
    int w = bmp.Width, h = bmp.Height, bytesPerRow = (w + 7) / 8;
    BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    byte[] px = new byte[data.Stride * h];
    Marshal.Copy(data.Scan0, px, 0, px.Length);
    int stride = data.Stride;
    bmp.UnlockBits(data);

    MemoryStream ms = new MemoryStream();
    ms.Write(new byte[] { 0x1B, 0x40 }, 0, 2);
    const int CHUNK = 128;
    for (int top = 0; top < h; top += CHUNK) {
      int rowsInChunk = Math.Min(CHUNK, h - top);
      ms.Write(new byte[] {
        0x1D, 0x76, 0x30, 0x00,
        (byte)(bytesPerRow & 0xFF), (byte)(bytesPerRow >> 8),
        (byte)(rowsInChunk & 0xFF), (byte)(rowsInChunk >> 8)
      }, 0, 8);
      for (int yy = top; yy < top + rowsInChunk; yy++) {
        for (int bx = 0; bx < bytesPerRow; bx++) {
          int value = 0;
          for (int bit = 0; bit < 8; bit++) {
            int x = bx * 8 + bit;
            if (x >= w) continue;
            int i = yy * stride + x * 4;
            int lum = (px[i + 2] * 299 + px[i + 1] * 587 + px[i] * 114) / 1000;
            if (lum < THRESHOLD) value |= 0x80 >> bit;
          }
          ms.WriteByte((byte)value);
        }
      }
    }
    ms.Write(new byte[] { 0x1B, 0x64, 0x04, 0x1D, 0x56, 0x00 }, 0, 6);
    return ms.ToArray();
  }
}
`;

/**
 * Texto literal do PowerShell (aspas simples): "\" e "$" ficam como estão.
 * JSON.stringify duplicava as barras de "\\PC\Impressora" e o Windows não achava a impressora.
 */
function psString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

async function runPowerShell(dir, script, label) {
  const psPath = join(dir, "print.ps1");
  // BOM: o PowerShell 5.1 lê scripts sem BOM como ANSI e estraga os acentos.
  // OutputEncoding UTF-8: mensagens de erro chegam ao Node com acento correto.
  writeFileSync(
    psPath,
    `\uFEFF[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${script}`,
    "utf8",
  );
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", psPath],
      { timeout: 45000, windowsHide: true, encoding: "utf8" },
    );
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr || error.message || error)
        : String(error);
    throw new Error(`${label}: ${detail.trim()}`);
  }
}

function requireWindows(printerName) {
  if (process.platform !== "win32") {
    throw new Error("Impressão raw só está disponível no Windows.");
  }
  const name = String(printerName || "").trim();
  if (!name) throw new Error("Informe o nome da impressora.");
  return name;
}

/**
 * Envia bytes raw (ESC/POS) para a fila da impressora no Windows.
 * @param {string} printerName
 * @param {Buffer} data
 */
export async function rawPrintWindows(printerName, data) {
  const tcp = parseTcpPrinter(printerName);
  if (tcp) {
    await sendTcp(tcp, data);
    return;
  }
  const name = requireWindows(printerName);
  const dir = mkdtempSync(join(tmpdir(), "food-wp-print-"));
  const binPath = join(dir, "ticket.bin");
  writeFileSync(binPath, data);
  try {
    await runPowerShell(
      dir,
      `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
${RAW_PRINTER_CS}
"@
$bytes = [System.IO.File]::ReadAllBytes(${psString(binPath)})
[FoodWpRawPrinter]::SendBytes(${psString(name)}, $bytes)
`,
      `Falha ao imprimir em "${name}"`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Imprime o cupom como imagem (mesmo visual do painel: fonte, acentos, tracejados).
 * @param {string} printerName — vazio + pngPath: só gera a prévia em PNG, sem imprimir.
 * @param {string[]} rows — linhas de buildReceiptLayout
 * @param {{ widthDots: number; fontScale?: number; pngPath?: string }} options
 */
export async function imagePrintWindows(printerName, rows, options) {
  const preview = !printerName && options.pngPath;
  const tcp = preview ? null : parseTcpPrinter(printerName);
  const name = preview ? "" : tcp ? String(printerName) : requireWindows(printerName);
  if (tcp && process.platform !== "win32") {
    throw new Error("O cupom em imagem é desenhado pelo Windows.");
  }
  const dir = mkdtempSync(join(tmpdir(), "food-wp-print-"));
  const rowsPath = join(dir, "ticket.txt");
  const binPath = join(dir, "ticket.bin");
  writeFileSync(rowsPath, rows.join("\n"), "utf8");
  const width = Math.max(8, Math.round(options.widthDots / 8) * 8);
  // Impressora por IP: o PowerShell só desenha; o envio é por socket no Node.
  const output = preview
    ? ""
    : tcp
      ? `[System.IO.File]::WriteAllBytes(${psString(binPath)}, $bytes)`
      : `Add-Type -TypeDefinition @"
${RAW_PRINTER_CS}
"@
[FoodWpRawPrinter]::SendBytes(${psString(name)}, $bytes)`;
  try {
    await runPowerShell(
      dir,
      `
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
${RECEIPT_RENDERER_CS}
"@
$rows = [System.IO.File]::ReadAllLines(${psString(rowsPath)}, [System.Text.Encoding]::UTF8)
$bytes = [FoodWpReceiptRenderer]::Render($rows, ${width}, 'Segoe UI', ${Number(options.fontScale) || 1}, ${psString(options.pngPath || "")})
${output}
`,
      preview ? "Falha ao gerar a prévia do cupom" : `Falha ao imprimir em "${name}"`,
    );
    if (tcp) await sendTcp(tcp, readFileSync(binPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
