# Compatibilidade: encaminha para o instalador do .exe (release) ou do Node (dev).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ReleaseInstall = Join-Path $Root "release\FoodWpPrint\install.ps1"
$ReleaseExe = Join-Path $Root "release\FoodWpPrint\food-wp-print-agent.exe"

if ((Test-Path $ReleaseInstall) -and (Test-Path $ReleaseExe)) {
  & $ReleaseInstall
  exit $LASTEXITCODE
}

Write-Host "Pacote .exe nao encontrado. Rode antes: npm run build:exe"
Write-Host "Fallback: iniciando via Node (apenas desenvolvimento)..."

$TaskName = "FoodWpPrintAgent"
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
  throw "Node.js nao encontrado. Gere o .exe com npm run build:exe ou instale Node."
}

$Action = New-ScheduledTaskAction -Execute $NodeCmd.Source -Argument "`"$Root\src\index.js`"" -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Tarefa '$TaskName' registrada via Node (dev)."
