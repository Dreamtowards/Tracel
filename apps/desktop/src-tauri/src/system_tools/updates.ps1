# Official NoAutoUpdate policy only; never stop services, delete tasks, or force a restart.
$policyPath = 'SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
$backupPath = 'SOFTWARE\Tracel\UpdatePolicy'
$machine = [Microsoft.Win32.Registry]::LocalMachine
$versionKey = $machine.OpenSubKey('SOFTWARE\Microsoft\Windows NT\CurrentVersion')
try { $edition = [string]$versionKey.GetValue('EditionID', '') } finally { $versionKey.Dispose() }
$supported = $edition -match '^(Professional|Enterprise|Education|IoTEnterprise)'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
try { $administrator = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) } finally { $identity.Dispose() }
function ReadPolicy {
    $key = $machine.OpenSubKey($policyPath)
    try {
        if ($null -eq $key -or $key.GetValueNames() -notcontains 'NoAutoUpdate') { return $null }
        if ($key.GetValueKind('NoAutoUpdate') -ne [Microsoft.Win32.RegistryValueKind]::DWord) { throw 'NoAutoUpdate has an unexpected registry type. No changes were made.' }
        return [int]$key.GetValue('NoAutoUpdate')
    } finally { if ($key) { $key.Dispose() } }
}
function ReadBackup {
    $key = $machine.OpenSubKey($backupPath)
    try {
        if ($key -and $key.GetValue('Snapshot')) { return ($key.GetValue('Snapshot') | ConvertFrom-Json) }
        return $null
    } finally { if ($key) { $key.Dispose() } }
}
$mutex = $null
$locked = $false
try {
    if ($mode -ne 'read') {
        if (!$supported) { throw 'Automatic-update policy requires a supported Windows Pro, Enterprise or Education edition.' }
        if (!$administrator) { throw 'Run Tracel as administrator to change the Windows update policy.' }
        $mutex = [Threading.Mutex]::new($false, 'Global\Tracel.UpdatePolicy.v1')
        try { $locked = $mutex.WaitOne(2000) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (!$locked) { throw 'Another update-policy operation is in progress.' }
    }
    $current = ReadPolicy
    $backup = ReadBackup
    if ($backup -and ($backup.schema -ne 1 -or ($null -ne $backup.original -and $backup.original -notin @(0, 1)))) { throw 'The saved policy backup is invalid. No changes were made.' }
    if ($mode -eq 'disable') {
        if (!$backup) {
            if ($null -ne $current -and $current -notin @(0, 1)) { throw 'An unfamiliar update policy is present. No changes were made.' }
            if ($current -eq 1) { throw 'Automatic updates are already disabled outside Tracel. Manage that policy at its source.' }
            $backup = [pscustomobject]@{ schema = 1; original = $current; since = $null }
            $key = $machine.CreateSubKey($backupPath)
            try { $key.SetValue('Snapshot', ($backup | ConvertTo-Json -Compress), [Microsoft.Win32.RegistryValueKind]::String); $key.Flush() } finally { $key.Dispose() }
        } elseif ($current -ne 1 -and $current -ne $backup.original) {
            throw 'The policy changed outside Tracel. No changes were made.'
        }
        $key = $machine.CreateSubKey($policyPath)
        try { $key.SetValue('NoAutoUpdate', 1, [Microsoft.Win32.RegistryValueKind]::DWord); $key.Flush() } finally { $key.Dispose() }
        if ((ReadPolicy) -ne 1) { throw 'Could not verify the update policy. Refresh its status.' }
        if (!$backup.since) {
            $backup.since = [DateTime]::UtcNow.ToString('o')
            $key = $machine.OpenSubKey($backupPath, $true)
            try { $key.SetValue('Snapshot', ($backup | ConvertTo-Json -Compress), [Microsoft.Win32.RegistryValueKind]::String); $key.Flush() } finally { $key.Dispose() }
        }
    } elseif ($mode -eq 'restore') {
        if (!$backup -or $backup.schema -ne 1) { throw 'No valid Tracel policy backup exists. No changes were made.' }
        if ($current -ne 1 -and $current -ne $backup.original) { throw 'The policy changed outside Tracel. No changes were made.' }
        $key = $machine.CreateSubKey($policyPath)
        try {
            if ($null -eq $backup.original) { $key.DeleteValue('NoAutoUpdate', $false) }
            else { $key.SetValue('NoAutoUpdate', [int]$backup.original, [Microsoft.Win32.RegistryValueKind]::DWord) }
            $key.Flush()
        } finally { $key.Dispose() }
        if ((ReadPolicy) -ne $backup.original) { throw 'Could not verify the restored update policy. Backup retained.' }
        $key = $machine.OpenSubKey($backupPath, $true)
        try { $key.DeleteValue('Snapshot', $false); $key.Flush() } finally { $key.Dispose() }
    }
    $current = ReadPolicy
    $backup = ReadBackup
    [ordered]@{ edition = $edition; supported = [bool]$supported; administrator = [bool]$administrator; disabled = ($current -eq 1); owned = ($null -ne $backup); since = $(if ($backup -and $current -eq 1) { $backup.since } else { $null }) } | ConvertTo-Json -Compress
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
