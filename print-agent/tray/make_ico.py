"""Gera o .ico do app/instalador a partir do mesmo desenho do ícone da bandeja."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from food_wp_print_tray import ICONS  # noqa: E402

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
ICONS["online"].save(out, format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print(f"ico: {out}")
