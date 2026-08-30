@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Food WP - Removendo o servico de impressao...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0uninstall.ps1\"'"

echo.
pause
