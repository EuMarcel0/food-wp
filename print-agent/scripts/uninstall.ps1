# Remove o agente Food WP Print deste computador.

$ErrorActionPreference = "Stop"
$TaskName = "FoodWpPrintAgent"
$InstallDir = Join-Path $env:ProgramFiles "FoodWpPrint"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-Process -Name "food-wp-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $InstallDir) {
  Remove-Item -Recurse -Force $InstallDir
}

Write-Host "Agente removido."
Write-Host "Config em %ProgramData%\FoodWpPrint pode ser apagada manualmente se quiser zerar o token."
