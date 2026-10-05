"""Food WP · Impressão — ícone na bandeja que mantém o agente local rodando.

Abre o food-wp-print-agent.exe oculto, mostra o status (online/offline) e
reabre o agente se ele cair. Substitui o serviço do Windows: inicia com o
login do usuário (chave Run do HKCU, criada pelo instalar.ps1).
"""

from __future__ import annotations

import ctypes
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import pystray
from PIL import Image, ImageDraw

APP_NAME = "Food WP · Impressão"
AGENT_EXE = "food-wp-print-agent.exe"
HEALTH_URL = "http://127.0.0.1:19100/health"
CHECK_SECONDS = 5
CREATE_NO_WINDOW = 0x08000000

DATA_DIR = Path(os.environ.get("FOOD_WP_PRINT_DIR") or Path(os.environ.get("ProgramData", Path.home())) / "FoodWpPrint")
LOG_PATH = DATA_DIR / "agent.log"


def base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def single_instance() -> bool:
    """Mutex nomeado: só um ícone por sessão."""
    ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\FoodWpPrintTray")
    return ctypes.windll.kernel32.GetLastError() != 183  # ERROR_ALREADY_EXISTS


def read_health() -> dict | None:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=2) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None


def make_icon(color: str) -> Image.Image:
    size = 64
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((4, 4, 60, 60), radius=14, fill="#ea580c")
    # impressora estilizada
    draw.rectangle((20, 14, 44, 24), fill="white")
    draw.rounded_rectangle((12, 24, 52, 42), radius=4, fill="white")
    draw.rectangle((20, 38, 44, 52), fill="white", outline="#ea580c", width=2)
    # bolinha de status
    draw.ellipse((40, 40, 62, 62), fill=color, outline="white", width=3)
    return image


ICONS = {
    "online": make_icon("#22c55e"),
    "starting": make_icon("#f59e0b"),
    "offline": make_icon("#ef4444"),
}


class Tray:
    def __init__(self) -> None:
        self.process: subprocess.Popen | None = None
        self.stopping = False
        self.status = "starting"
        self.detail = "Iniciando…"
        self.failures = 0
        self.lock = threading.Lock()
        self.icon = pystray.Icon("FoodWpPrint", ICONS["starting"], APP_NAME, menu=self.build_menu())

    # ---- agente -------------------------------------------------------
    def agent_path(self) -> Path:
        return base_dir() / AGENT_EXE

    def start_agent(self) -> None:
        with self.lock:
            if self.process and self.process.poll() is None:
                return
            if read_health():
                # Já há um agente respondendo (outra instância): só monitora.
                self.process = None
                return
            path = self.agent_path()
            if not path.exists():
                self.set_status("offline", f"{AGENT_EXE} não encontrado")
                return
            self.process = subprocess.Popen(
                [str(path)],
                cwd=str(path.parent),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=CREATE_NO_WINDOW,
            )

    def stop_agent(self) -> None:
        with self.lock:
            process, self.process = self.process, None
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

    def restart_agent(self) -> None:
        self.set_status("starting", "Reiniciando…")
        self.stop_agent()
        time.sleep(1)
        self.failures = 0
        self.start_agent()

    # ---- status -------------------------------------------------------
    def set_status(self, status: str, detail: str) -> None:
        if status == self.status and detail == self.detail:
            return
        self.status = status
        self.detail = detail
        try:
            self.icon.icon = ICONS[status]
            self.icon.title = f"{APP_NAME} — {detail}"[:127]
            self.icon.update_menu()
        except Exception:
            pass  # ícone ainda não exibido

    def monitor(self) -> None:
        self.start_agent()
        while not self.stopping:
            health = read_health()
            if health and health.get("ok"):
                self.failures = 0
                printer = health.get("printerName") or "impressora não definida"
                queue = " · fila ativa" if health.get("queuePolling") else ""
                self.set_status("online", f"Online · {printer}{queue}")
            else:
                exited = self.process is None or self.process.poll() is not None
                if exited:
                    self.failures += 1
                    self.set_status("offline", "Agente parado — reiniciando…")
                    # Backoff simples para não ficar em loop apertado se o agente cair sempre.
                    time.sleep(min(60, 2 ** min(self.failures, 5)))
                    if not self.stopping:
                        self.start_agent()
                else:
                    self.set_status("starting", "Aguardando o agente responder…")
            time.sleep(CHECK_SECONDS)

    # ---- menu ---------------------------------------------------------
    def build_menu(self) -> pystray.Menu:
        return pystray.Menu(
            pystray.MenuItem(lambda _item: self.detail, None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Reiniciar agente", lambda: threading.Thread(target=self.restart_agent, daemon=True).start()),
            pystray.MenuItem("Abrir log", lambda: self.open_path(LOG_PATH)),
            pystray.MenuItem("Abrir pasta de configuração", lambda: self.open_path(DATA_DIR)),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Sair (para a impressão)", self.quit),
        )

    @staticmethod
    def open_path(path: Path) -> None:
        try:
            os.startfile(str(path))  # type: ignore[attr-defined]
        except OSError:
            pass

    def quit(self) -> None:
        self.stopping = True
        self.stop_agent()
        self.icon.stop()

    def run(self) -> None:
        threading.Thread(target=self.monitor, daemon=True).start()
        self.icon.run()


def main() -> None:
    if not single_instance():
        return
    Tray().run()


if __name__ == "__main__":
    main()
