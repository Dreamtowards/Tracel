$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$desktopManifest = Get-Content -Raw (Join-Path $repoPath 'apps/desktop/package.json') | ConvertFrom-Json
$releaseName = "Tracel-$($desktopManifest.version)-windows-x64"
$portableRoot = Join-Path $repoPath 'target/portable'
$releasePath = Join-Path $portableRoot $releaseName
$exePath = Join-Path $repoPath 'target/release/tracel-desktop.exe'
if (-not (Test-Path -LiteralPath $exePath)) { throw 'Build the native executable first.' }
New-Item -ItemType Directory -Force -Path $releasePath | Out-Null
Copy-Item -LiteralPath $exePath -Destination (Join-Path $releasePath 'Tracel.exe') -Force
@'
Tracel Activity: extract this ZIP and double-click Tracel.exe. No installer required.
Requires Windows x64 and Microsoft Edge WebView2 Runtime (normally installed on Windows 11).
Preferences, window placement and the SQLite archive use the Windows user application-data directory.
Prevent automatic sleep allows normal display timeout. It resets off on restart.
The manual display-off action is disabled after a wake-up reliability issue.
Closing the application stops collection. Recorded Timeline history persists in local SQLite.
Settings shows the database path. Close Tracel before copying the database for backup.
Audio diagnostics use temporary recent-signal history and do not record sound.
'@ | Set-Content -LiteralPath (Join-Path $releasePath 'README.txt') -Encoding UTF8
$zipPath = Join-Path $portableRoot "$releaseName.zip"
Compress-Archive -LiteralPath (Join-Path $releasePath 'Tracel.exe'), (Join-Path $releasePath 'README.txt') -DestinationPath $zipPath -Force
Write-Output $zipPath
