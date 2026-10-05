# Remove o Food WP · Impressao (app de inicializacao). A configuracao em
# %ProgramData%\FoodWpPrint (token/impressora) e mantida.

$InstallDir = Join-Path $env:LOCALAPPDATA "FoodWpPrint"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

Remove-ItemProperty -Path $RunKey -Name "FoodWpPrint" -ErrorAction SilentlyContinue
Get-Process -Name "FoodWpPrintTray", "food-wp-print-agent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# O proprio script pode estar dentro da pasta: apaga o resto e agenda a pasta.
Get-ChildItem -Path $InstallDir -Exclude "desinstalar.*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Start-Process cmd -WindowStyle Hidden -ArgumentList "/c timeout /t 2 >nul & rmdir /s /q `"$InstallDir`""

Write-Host "Food WP Impressao removido. Configuracao mantida em $env:ProgramData\FoodWpPrint."
