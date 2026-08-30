# Instala o Food WP Print Agent como SERVICO do Windows (sem janela).
# Clique direito → Executar com PowerShell como Administrador.

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute este script como Administrador (botao direito → Executar como administrador)."
  }
}

Assert-Admin

$SourceDir = $PSScriptRoot
$AgentExeName = "food-wp-print-agent.exe"
$ServiceExeName = "FoodWpPrint.exe"
$ServiceXmlName = "FoodWpPrint.xml"
$TaskName = "FoodWpPrintAgent"
$ServiceName = "FoodWpPrint"

$SourceAgent = Join-Path $SourceDir $AgentExeName
$SourceService = Join-Path $SourceDir $ServiceExeName
$SourceXml = Join-Path $SourceDir $ServiceXmlName

foreach ($path in @($SourceAgent, $SourceService, $SourceXml)) {
  if (-not (Test-Path $path)) {
    throw "Arquivo nao encontrado: $path"
  }
}

$InstallDir = Join-Path $env:ProgramFiles "FoodWpPrint"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Remove instalacao antiga (tarefa agendada / processo em janela).
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Get-Process -Name "food-wp-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$InstalledService = Join-Path $InstallDir $ServiceExeName
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
  try { & $InstalledService stop } catch {}
  Start-Sleep -Seconds 1
  try { & $InstalledService uninstall } catch {}
  Start-Sleep -Seconds 1
}

Copy-Item -Force -Path $SourceAgent -Destination (Join-Path $InstallDir $AgentExeName)
Copy-Item -Force -Path $SourceService -Destination $InstalledService
Copy-Item -Force -Path $SourceXml -Destination (Join-Path $InstallDir $ServiceXmlName)
Copy-Item -Force -Path (Join-Path $SourceDir "uninstall.ps1") -Destination (Join-Path $InstallDir "uninstall.ps1") -ErrorAction SilentlyContinue

& $InstalledService install
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao registrar o servico Windows (codigo $LASTEXITCODE)."
}

& $InstalledService start
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:19100/health" -TimeoutSec 5
  Write-Host ""
  Write-Host "Servico instalado e rodando em segundo plano (sem janela)."
  Write-Host ("Host: " + $health.host)
  Write-Host "Pasta: $InstallDir"
  Write-Host "Servico: $ServiceName (inicializacao automatica)"
  Write-Host "Painel: Configuracoes → Impressao → Conectar agente"
  Write-Host ""
  Write-Host "Os funcionarios nao precisam deixar nenhuma janela aberta."
  Write-Host ""
} catch {
  Write-Host ""
  Write-Host "Servico instalado em $InstallDir, mas o health ainda nao respondeu."
  Write-Host "Verifique: services.msc → Food WP Print Agent"
  Write-Host ""
}
