# Instala o Food WP · Impressão como app que abre junto com o Windows (sem servico).
# Rode pelo instalar.bat (clique duplo). Nao precisa ser administrador; so pede
# permissao se encontrar o servico antigo para remover.

$ErrorActionPreference = "Stop"
$Source = $PSScriptRoot
$InstallDir = Join-Path $env:LOCALAPPDATA "FoodWpPrint"
$DataDir = Join-Path $env:ProgramData "FoodWpPrint"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$TrayExe = "FoodWpPrintTray.exe"
$AgentExe = "food-wp-print-agent.exe"

foreach ($name in @($TrayExe, $AgentExe)) {
  if (-not (Test-Path (Join-Path $Source $name))) { throw "Arquivo nao encontrado: $name" }
}

function Test-Writable([string]$dir) {
  if (-not (Test-Path $dir)) { return $true }
  try {
    $probe = Join-Path $dir ".write-test"
    [IO.File]::WriteAllText($probe, "ok")
    Remove-Item $probe -Force
    $config = Join-Path $dir "config.json"
    if (Test-Path $config) { [IO.File]::Open($config, "Open", "ReadWrite").Close() }
    return $true
  } catch { return $false }
}

# 1) Servico antigo / pasta criada pelo servico (SYSTEM) -> precisa de admin uma vez.
$service = Get-Service -Name "FoodWpPrint" -ErrorAction SilentlyContinue
if ($service -or -not (Test-Writable $DataDir)) {
  Write-Host "Removendo o servico antigo e liberando a pasta de configuracao..."
  Write-Host "(o Windows vai pedir permissao de administrador)"
  $elevated = @"
`$svc = Get-Service -Name 'FoodWpPrint' -ErrorAction SilentlyContinue
if (`$svc) {
  Stop-Service -Name 'FoodWpPrint' -Force -ErrorAction SilentlyContinue
  `$winsw = Join-Path `$env:ProgramFiles 'FoodWpPrint\FoodWpPrint.exe'
  if (Test-Path `$winsw) { & `$winsw uninstall | Out-Null } else { sc.exe delete FoodWpPrint | Out-Null }
}
Get-Process -Name 'food-wp-print-agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if (Test-Path '$DataDir') { icacls '$DataDir' /grant '*S-1-5-32-545:(OI)(CI)M' /T | Out-Null }
"@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($elevated))
  try {
    Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded
  } catch {
    Write-Host ""
    Write-Host "Permissao negada. O servico antigo continua instalado e pode conflitar com o app."
    Write-Host "Rode o instalar.bat de novo e aceite a permissao de administrador."
    Write-Host ""
  }
}

# 2) Instalacoes antigas na sessao do usuario.
Unregister-ScheduledTask -TaskName "FoodWpPrintAgent" -Confirm:$false -ErrorAction SilentlyContinue
Get-Process -Name "FoodWpPrintTray", "food-wp-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 3) Copia e registra para abrir com o Windows.
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
foreach ($name in @($TrayExe, $AgentExe, "desinstalar.bat", "desinstalar.ps1")) {
  $from = Join-Path $Source $name
  if (Test-Path $from) { Copy-Item -Force -Path $from -Destination (Join-Path $InstallDir $name) }
}
Set-ItemProperty -Path $RunKey -Name "FoodWpPrint" -Value "`"$(Join-Path $InstallDir $TrayExe)`""

# 4) Abre agora.
Start-Process -FilePath (Join-Path $InstallDir $TrayExe) -WorkingDirectory $InstallDir

$ok = $false
for ($i = 0; $i -lt 15 -and -not $ok; $i++) {
  Start-Sleep -Seconds 1
  try { $ok = (Invoke-RestMethod -Uri "http://127.0.0.1:19100/health" -TimeoutSec 2).ok } catch {}
}

Write-Host ""
if ($ok) {
  Write-Host "Pronto! Food WP Impressao instalado e rodando."
} else {
  Write-Host "App instalado, mas o agente ainda nao respondeu."
  Write-Host "Clique no icone da impressora perto do relogio > Abrir log."
}
Write-Host "Pasta: $InstallDir"
Write-Host "Abre sozinho quando este usuario entrar no Windows (icone perto do relogio)."
Write-Host "Painel: Configuracoes > Impressao > Atualizar (ou Conectar agente)."
Write-Host ""
