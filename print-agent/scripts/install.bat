@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Food WP - Instalando o servico de impressao...
echo (e necessario confirmar o UAC / Administrador)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0install.ps1\"'"

echo.
pause
