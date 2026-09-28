# Gera cardapio.png a partir de cardapio.html (Chrome headless).
# A escala deixa o lado maior com 2048 px: é o limite do upload em Configurações.
param([int]$LongSide = 2048)

$chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe" }
$dir = $PSScriptRoot
$url = "file:///" + ($dir -replace '\\', '/') + "/cardapio.html"
$profile = "--user-data-dir=$env:TEMP\chrome-menu"
$width = 1400

$dom = & $chrome --headless=new --disable-gpu $profile --window-size=$width,2000 --virtual-time-budget=8000 --dump-dom $url 2>$null | Out-String
$height = [int]([regex]::Match($dom, '<title>(\d+)</title>').Groups[1].Value)
if (-not $height) { throw "Não consegui medir a altura da página." }

$scale = [math]::Round($LongSide / [math]::Max($width, $height), 4)
$scaleArg = $scale.ToString([Globalization.CultureInfo]::InvariantCulture)
$out = Join-Path $dir "cardapio.png"
$args = @("--headless=new", "--disable-gpu", "--hide-scrollbars", $profile, "--force-device-scale-factor=$scaleArg",
  "--window-size=$width,$height", "--virtual-time-budget=8000", "--screenshot=$out", $url)
Start-Process -FilePath $chrome -ArgumentList $args -Wait -NoNewWindow
Write-Output "cardapio.png: $([math]::Round($width * $scale)) x $([math]::Round($height * $scale)) px (layout $width x $height)"
