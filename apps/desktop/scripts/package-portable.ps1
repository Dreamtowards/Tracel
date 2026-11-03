param([switch]$PackageOnly)

$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$desktopManifest = Get-Content -Raw (Join-Path $repoPath 'apps/desktop/package.json') | ConvertFrom-Json
$releaseName = "Tracel-$($desktopManifest.version)-windows-x64"
$portableRoot = Join-Path $repoPath 'target/portable'
$releasePath = Join-Path $portableRoot $releaseName
$exePath = Join-Path $repoPath 'target/release/tracel-desktop.exe'
$portableExe = Join-Path $releasePath 'Tracel.exe'
$zipPath = Join-Path $portableRoot "$releaseName.zip"
$hashPath = "$zipPath.sha256"
if ((Test-Path -LiteralPath $zipPath) -or (Test-Path -LiteralPath $hashPath)) {
    throw 'This ZIP release already exists. Preserve it and use a new version.'
}
if ($PackageOnly) {
    if (-not (Test-Path -LiteralPath $portableExe)) { throw 'No versioned Tracel.exe to package.' }
} else {
    if (Test-Path -LiteralPath $portableExe) { throw 'This versioned EXE already exists. Use -PackageOnly to package it without rebuilding.' }
    if (-not (Test-Path -LiteralPath $exePath)) { throw 'Build the native executable first.' }
    New-Item -ItemType Directory -Force -Path $releasePath | Out-Null
    Copy-Item -LiteralPath $exePath -Destination $portableExe
}
# The archive root always contains exactly Tracel.exe, independent of release version.
Compress-Archive -LiteralPath $portableExe -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $releaseName.zip" | Set-Content -LiteralPath $hashPath -Encoding ascii
Write-Output $zipPath
Write-Output $hashPath
