# Remove o servico Food WP Print Agent deste computador.
# Preferivel executar como Administrador.

$ErrorActionPreference = "Stop"
$ServiceName = "FoodWpPrint"
$TaskName = "FoodWpPrintAgent"
$InstallDir = Join-Path $env:ProgramFiles "FoodWpPrint"
$ServiceExe = Join-Path $InstallDir "FoodWpPrint.exe"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

if (Test-Path $ServiceExe) {
  try { & $ServiceExe stop } catch {}
  Start-Sleep -Seconds 1
  try { & $ServiceExe uninstall } catch {}
  Start-Sleep -Seconds 1
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName | Out-Null
}

Get-Process -Name "food-wp-print-agent","FoodWpPrint" -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $InstallDir) {
  Remove-Item -Recurse -Force $InstallDir
}

Write-Host "Servico removido."
Write-Host "Config em %ProgramData%\FoodWpPrint pode ser apagada manualmente se quiser zerar o token."
