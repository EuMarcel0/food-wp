# Instala o agente Food WP Print (exe) para iniciar com o Windows.
# Clique direito → Executar com PowerShell (preferencialmente como Administrador).

$ErrorActionPreference = "Stop"
$TaskName = "FoodWpPrintAgent"
$SourceDir = $PSScriptRoot
$ExeName = "food-wp-print-agent.exe"
$SourceExe = Join-Path $SourceDir $ExeName

if (-not (Test-Path $SourceExe)) {
  throw "Arquivo $ExeName nao encontrado nesta pasta."
}

$InstallDir = Join-Path $env:ProgramFiles "FoodWpPrint"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Force -Path $SourceExe -Destination (Join-Path $InstallDir $ExeName)
Copy-Item -Force -Path (Join-Path $SourceDir "uninstall.ps1") -Destination (Join-Path $InstallDir "uninstall.ps1") -ErrorAction SilentlyContinue

$Exe = Join-Path $InstallDir $ExeName
$Action = New-ScheduledTaskAction -Execute $Exe -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

Get-Process -Name "food-wp-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $Exe -WorkingDirectory $InstallDir

Start-Sleep -Seconds 1
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:19100/health" -TimeoutSec 3
  Write-Host ""
  Write-Host "Agente instalado e online."
  Write-Host ("Host: " + $health.host)
  Write-Host "Pasta: $InstallDir"
  Write-Host "Painel: Configuracoes → Impressao → Conectar agente"
  Write-Host ""
} catch {
  Write-Host ""
  Write-Host "Arquivos instalados em $InstallDir"
  Write-Host "Se o health nao respondeu, abra o exe manualmente e verifique o firewall."
  Write-Host ""
}
