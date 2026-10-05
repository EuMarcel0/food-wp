# Chamado pelo instalador antes de copiar os arquivos:
# remove o servico antigo (pede admin so se existir) e fecha versoes abertas.

$ErrorActionPreference = "Continue"
$DataDir = Join-Path $env:ProgramData "FoodWpPrint"

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

$service = Get-Service -Name "FoodWpPrint" -ErrorAction SilentlyContinue
if ($service -or -not (Test-Writable $DataDir)) {
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
    Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded
  } catch {}
}

Unregister-ScheduledTask -TaskName "FoodWpPrintAgent" -Confirm:$false -ErrorAction SilentlyContinue
Get-Process -Name "FoodWpPrintTray", "food-wp-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
exit 0
