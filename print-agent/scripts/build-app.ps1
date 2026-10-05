# Gera o pacote "app de inicializacao" (sem servico do Windows):
#   release\FoodWpPrintApp\  -> FoodWpPrintTray.exe + food-wp-print-agent.exe + instalar.bat
# Requer: Node (npm run build:exe) e Python com pyinstaller, pystray e pillow.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

npm run build:exe
if ($LASTEXITCODE -ne 0) { throw "Falha no build do agente." }

$Work = Join-Path $Root "build-tray"
$Icon = Join-Path $Work "app.ico"
python (Join-Path $Root "tray\make_ico.py") $Icon
if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar o icone." }
python -m PyInstaller --noconfirm --onefile --windowed --name FoodWpPrintTray --icon $Icon `
  --distpath (Join-Path $Work "dist") --workpath (Join-Path $Work "work") --specpath $Work `
  (Join-Path $Root "tray\food_wp_print_tray.py")
if ($LASTEXITCODE -ne 0) { throw "Falha no build do icone da bandeja (pyinstaller)." }

$Out = Join-Path $Root "release\FoodWpPrintApp"
Remove-Item -Recurse -Force $Out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Copy-Item (Join-Path $Root "release\FoodWpPrint\food-wp-print-agent.exe") $Out
Copy-Item (Join-Path $Work "dist\FoodWpPrintTray.exe") $Out
foreach ($name in @("instalar.bat", "instalar.ps1", "desinstalar.bat", "desinstalar.ps1", "preparar.ps1")) {
  Copy-Item (Join-Path $Root "tray\$name") $Out
}
@"
Food WP - Impressao (app que abre com o Windows)

Instalar: clique duplo em instalar.bat (no PC da cozinha, com o usuario que fica logado).
- Remove o servico antigo, se existir (pede permissao de administrador uma vez).
- Instala em %LOCALAPPDATA%\FoodWpPrint e abre junto com o Windows.
- Icone de impressora perto do relogio: verde = online, amarelo = iniciando, vermelho = parado.
  Clique com o botao direito para Reiniciar agente, Abrir log ou Sair.

Painel: Configuracoes > Impressao > Atualizar (ou Conectar agente).
Desinstalar: desinstalar.bat.
"@ | Set-Content -Path (Join-Path $Out "LEIA-ME.txt") -Encoding ASCII

$Iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($Iscc) {
  & $Iscc /Q "/DSourceDir=$Out" "/DIconFile=$Icon" (Join-Path $Root "tray\FoodWpImpressao.iss")
  if ($LASTEXITCODE -ne 0) { throw "Falha ao compilar o instalador (Inno Setup)." }
  Write-Host "Instalador: $(Join-Path $Root 'release\FoodWpImpressao-Setup.exe')"
} else {
  Write-Host "Inno Setup nao encontrado: instalador .exe nao gerado (winget install JRSoftware.InnoSetup)."
}

Write-Host ""
Write-Host "Pacote pronto: $Out"
