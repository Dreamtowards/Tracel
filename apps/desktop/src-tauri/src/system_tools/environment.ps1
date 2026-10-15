# Read metadata only. No Java, Python, dotnet, shell aliases or installer is executed.
$entries = [Collections.Generic.List[object]]::new()
$warnings = [Collections.Generic.List[string]]::new()
$seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
function LocalPath([string]$path) { return $path -match '^[A-Za-z]:\\' -and $path -notmatch '\\WindowsApps(\\|$)' }
function AddEntry([string]$kind, [string]$version, [string]$path, [string]$source) {
    if (!(LocalPath $path) -or $entries.Count -ge 512) { return }
    if (Test-Path -LiteralPath $path) {
        $path = [IO.Path]::GetFullPath($path).TrimEnd('\')
        if ($seen.Add("$kind|$path")) { $entries.Add([ordered]@{kind=$kind; version=$(if ($version) { $version } else { 'Unknown version' }); path=$path; source=$source}) }
    }
}
function JavaRoot([string]$path, [string]$source) {
    if (!(LocalPath $path)) { return }
    $exe = Join-Path $path 'bin\java.exe'
    if (Test-Path -LiteralPath $exe -PathType Leaf) {
        $release = Join-Path $path 'release'
        $v = ''
        if (Test-Path -LiteralPath $release -PathType Leaf) {
            $line = Get-Content -LiteralPath $release -TotalCount 100 | Where-Object { $_ -match '^JAVA_VERSION=' } | Select-Object -First 1
            if ($line) { $v = ($line -split '=', 2)[1].Trim('"') }
        }
        $kind = if (Test-Path -LiteralPath (Join-Path $path 'bin\javac.exe')) { 'Java JDK' } else { 'Java JRE' }
        AddEntry $kind $v $path $source
    }
}
function PythonExe([string]$path, [string]$version, [string]$source) {
    if (!(LocalPath $path) -or !(Test-Path -LiteralPath $path -PathType Leaf)) { return }
    if (!$version) { $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($path).ProductVersion }
    AddEntry 'Python' $version $path $source
}
function DotnetRoot([string]$path, [string]$source) {
    if (!(LocalPath $path) -or !(Test-Path -LiteralPath (Join-Path $path 'dotnet.exe') -PathType Leaf)) { return }
    foreach ($dir in @(Get-ChildItem -LiteralPath (Join-Path $path 'sdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 100)) { AddEntry '.NET SDK' $dir.Name $dir.FullName $source }
    foreach ($family in @(Get-ChildItem -LiteralPath (Join-Path $path 'shared') -Directory -ErrorAction SilentlyContinue | Select-Object -First 20)) {
        foreach ($dir in @(Get-ChildItem -LiteralPath $family.FullName -Directory -ErrorAction SilentlyContinue | Select-Object -First 100)) { AddEntry ".NET $($family.Name)" $dir.Name $dir.FullName $source }
    }
}
# PEP 514, including both machine registry views and per-user registration.
foreach ($root in @('HKCU:\Software\Python', 'HKLM:\Software\Python', 'HKLM:\Software\WOW6432Node\Python')) {
    foreach ($company in @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | Select-Object -First 50)) {
        if ($company.PSChildName -eq 'PyLauncher') { continue }
        foreach ($tag in @(Get-ChildItem -LiteralPath $company.PSPath -ErrorAction SilentlyContinue | Select-Object -First 100)) {
            $meta = Get-ItemProperty -LiteralPath $tag.PSPath
            $install = Get-Item -LiteralPath ($tag.PSPath + '\InstallPath') -ErrorAction SilentlyContinue
            if (!$install) { continue }
            $exe = [string]$install.GetValue('ExecutablePath', '')
            if (!$exe -and $company.PSChildName -eq 'PythonCore') { $exe = Join-Path ([string]$install.GetValue('')) 'python.exe' }
            PythonExe $exe ([string]$meta.SysVersion) 'Registry'
        }
    }
}
foreach ($root in @('HKLM:\Software\JavaSoft\JDK', 'HKLM:\Software\JavaSoft\Java Development Kit', 'HKLM:\Software\JavaSoft\Java Runtime Environment', 'HKLM:\Software\WOW6432Node\JavaSoft\Java Runtime Environment')) {
    foreach ($key in @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | Select-Object -First 100)) {
        JavaRoot ([string](Get-ItemProperty -LiteralPath $key.PSPath).JavaHome) 'Registry'
    }
}
JavaRoot $env:JAVA_HOME 'JAVA_HOME'
foreach ($root in @($env:DOTNET_ROOT, $env:DOTNET_ROOT_X64, $env:DOTNET_ROOT_X86, "${env:ProgramFiles}\dotnet", "${env:ProgramFiles(x86)}\dotnet", "$env:USERPROFILE\.dotnet")) { DotnetRoot $root 'Install directory' }
foreach ($root in @("$env:ProgramFiles\Java", "$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Amazon Corretto", "$env:ProgramFiles\Zulu", "$env:USERPROFILE\.jdks")) {
    foreach ($dir in @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Select-Object -First 100)) { JavaRoot $dir.FullName 'Install directory' }
}
foreach ($dir in @(Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\Programs\Python" -Directory -ErrorAction SilentlyContinue | Select-Object -First 100)) { PythonExe (Join-Path $dir.FullName 'python.exe') '' 'Install directory' }
$paths = @($env:Path -split ';' | Select-Object -First 256)
foreach ($dir in $paths) {
    $dir = [Environment]::ExpandEnvironmentVariables($dir.Trim('"'))
    if (!(LocalPath $dir)) { continue }
    PythonExe (Join-Path $dir 'python.exe') '' 'PATH'
    DotnetRoot $dir 'PATH'
    if (Test-Path -LiteralPath (Join-Path $dir 'java.exe') -PathType Leaf) { JavaRoot (Split-Path $dir -Parent) 'PATH' }
}
if ($entries.Count -ge 512 -or ($env:Path -split ';').Count -gt 256) { $warnings.Add('Scan limit reached. Results may be incomplete.') }
[ordered]@{ entries = @($entries.ToArray() | Sort-Object kind, path); warnings = @($warnings.ToArray()) } | ConvertTo-Json -Depth 5 -Compress
