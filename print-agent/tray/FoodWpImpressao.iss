; Instalador do Food WP · Impressão (app que abre com o Windows, sem serviço).
; Gerado por scripts\build-app.ps1 (ISCC com /DSourceDir e /DIconFile).

#define AppName "Food WP Impressao"
#define AppVersion "1.0.0"

[Setup]
AppId={{6B0E4C1A-5D2F-4C8B-9E31-FD0A1B2C3D4E}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Food WP
DefaultDirName={localappdata}\FoodWpPrint
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#SourceDir}\..
OutputBaseFilename=FoodWpImpressao-Setup
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\FoodWpPrintTray.exe
UninstallDisplayName={#AppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=no

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "{#SourceDir}\preparar.ps1"; Flags: dontcopy
Source: "{#SourceDir}\FoodWpPrintTray.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\food-wp-print-agent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{userprograms}\Food WP Impressao"; Filename: "{app}\FoodWpPrintTray.exe"
Name: "{userprograms}\Desinstalar Food WP Impressao"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "FoodWpPrint"; ValueData: """{app}\FoodWpPrintTray.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\FoodWpPrintTray.exe"; Description: "Abrir o Food WP Impressao agora"; Flags: nowait postinstall

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/IM FoodWpPrintTray.exe /F"; Flags: runhidden; RunOnceId: "KillTray"
Filename: "taskkill.exe"; Parameters: "/IM food-wp-print-agent.exe /F"; Flags: runhidden; RunOnceId: "KillAgent"

[Messages]
ptbr.FinishedLabel=O Food WP Impressao foi instalado. Ele abre sozinho quando este usuario entrar no Windows (icone de impressora perto do relogio). No painel: Configuracoes > Impressao > Atualizar.

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  ExtractTemporaryFile('preparar.ps1');
  Exec('powershell.exe',
    '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + ExpandConstant('{tmp}\preparar.ps1') + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
