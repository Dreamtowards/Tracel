//! Explicit, bounded Windows maintenance requests. No startup tasks or polling enforcement.
use serde::Serialize;

#[derive(Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentEntry {
    kind: String,
    version: String,
    path: String,
    source: String,
}

#[derive(Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentReport {
    entries: Vec<EnvironmentEntry>,
    warnings: Vec<String>,
}

#[derive(Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    edition: String,
    supported: bool,
    administrator: bool,
    disabled: bool,
    owned: bool,
    since: Option<String>,
}

pub fn environment() -> Result<EnvironmentReport, String> {
    static SCAN: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = SCAN
        .try_lock()
        .map_err(|_| "An environment scan is already in progress")?;
    run_json(include_str!("system_tools/environment.ps1"))
}

pub fn updates(action: &str) -> Result<UpdateStatus, String> {
    let mode = match action {
        "read" => "'read'",
        "disable" => "'disable'",
        "restore" => "'restore'",
        _ => return Err("Unknown update action".into()),
    };
    // Serialize reads and writes within this process. The script also takes a machine-wide mutex.
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().map_err(|e| e.to_string())?;
    run_json(&format!(
        "$mode = {mode}\n{}",
        include_str!("system_tools/updates.ps1")
    ))
}

#[cfg(windows)]
fn run_json<T: serde::de::DeserializeOwned>(script: &str) -> Result<T, String> {
    use std::{
        io::Read,
        os::windows::process::CommandExt,
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    let root = std::env::var_os("SystemRoot").ok_or("Windows directory unavailable")?;
    let exe = std::path::PathBuf::from(root).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let wrapped = format!("[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)\n$ErrorActionPreference = 'Stop'\ntry {{\n{script}\n}} catch {{ [Console]::Error.WriteLine($_.Exception.Message); exit 1 }}");
    let mut child = Command::new(exe)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &wrapped,
        ])
        .creation_flags(0x08000000)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    // Drain both pipes concurrently, with bounded allocations. No third-party executables are launched.
    let stdout = child.stdout.take().ok_or("Missing output pipe")?;
    let stderr = child.stderr.take().ok_or("Missing error pipe")?;
    let out = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout
            .take(1_048_577)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    let err = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        stderr.take(65_537).read_to_end(&mut bytes).map(|_| bytes)
    });
    let start = Instant::now();
    let result = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) if start.elapsed() < Duration::from_secs(12) => {
                std::thread::sleep(Duration::from_millis(30))
            }
            Ok(None) => {
                break Err(
                    "Windows request timed out; refresh its status before retrying".to_string(),
                )
            }
            Err(e) => break Err(e.to_string()),
        }
    };
    if result.is_err() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let output = out
        .join()
        .map_err(|_| "Output reader failed")?
        .map_err(|e| e.to_string())?;
    let errors = err
        .join()
        .map_err(|_| "Error reader failed")?
        .map_err(|e| e.to_string())?;
    if !result?.success() {
        return Err(String::from_utf8_lossy(&errors).trim().to_owned());
    }
    if output.len() > 1_048_576 {
        return Err("Windows response exceeded its size limit".into());
    }
    serde_json::from_slice(&output).map_err(|e| format!("Invalid Windows response: {e}"))
}

#[cfg(not(windows))]
fn run_json<T: serde::de::DeserializeOwned>(_: &str) -> Result<T, String> {
    Err("Requires Windows".into())
}

pub fn open_shortcut(target: &str) -> Result<(), String> {
    let (file, args) = shortcut(target).ok_or("Unknown system shortcut")?;
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Shell::ShellExecuteW;
        let file = if file.starts_with("ms-settings:") {
            file.to_owned()
        } else {
            std::path::PathBuf::from(
                std::env::var_os("SystemRoot").ok_or("Windows directory unavailable")?,
            )
            .join("System32")
            .join(file)
            .to_string_lossy()
            .into_owned()
        };
        let args = if target == "environment" {
            let dll = std::path::PathBuf::from(
                std::env::var_os("SystemRoot").ok_or("Windows directory unavailable")?,
            )
            .join("System32/sysdm.cpl");
            format!("\"{}\",EditEnvironmentVariables", dll.display())
        } else {
            args.to_owned()
        };
        let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                wide("open").as_ptr(),
                wide(&file).as_ptr(),
                wide(&args).as_ptr(),
                std::ptr::null(),
                1,
            )
        };
        if result as isize <= 32 {
            return Err(format!(
                "Could not open Windows settings ({})",
                result as isize
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (file, args);
        Err("Requires Windows".into())
    }
}

fn shortcut(target: &str) -> Option<(&'static str, &'static str)> {
    Some(match target {
        "environment" => ("rundll32.exe", "sysdm.cpl,EditEnvironmentVariables"),
        "updates" => ("ms-settings:windowsupdate", ""),
        "startup" => ("ms-settings:startupapps", ""),
        "storage" => ("ms-settings:storagesense", ""),
        "apps" => ("ms-settings:appsfeatures", ""),
        "task-manager" => ("Taskmgr.exe", ""),
        "resources" => ("resmon.exe", ""),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_unrecognized_actions_before_launching_anything() {
        assert!(super::updates("disable; Remove-Item C:\\").is_err());
        assert!(super::open_shortcut("powershell.exe").is_err());
        assert!(super::shortcut("environment").is_some());
    }
    #[cfg(windows)]
    #[test]
    fn read_only_windows_tools_smoke() {
        let report = super::environment().unwrap();
        assert!(report.entries.len() <= 512);
        assert!(report.entries.iter().all(|e| !e.path.is_empty()));
        let status = super::updates("read").unwrap();
        assert!(!status.edition.is_empty());
        // Never invoke disable/restore or open any system windows in tests.
    }

    #[cfg(windows)]
    #[test]
    fn update_policy_roundtrip_and_conflicts_use_only_isolated_user_registry() {
        let id = format!(
            "TracelTest-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        // Redirect only the policy/backup store after reading the OS edition. No HKLM writes.
        let script = include_str!("system_tools/updates.ps1")
            .replace("SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", &format!("SOFTWARE\\{id}\\AU"))
            .replace("SOFTWARE\\Tracel\\UpdatePolicy", &format!("SOFTWARE\\{id}\\Backup"))
            .replace("function ReadPolicy {", "$machine = [Microsoft.Win32.Registry]::CurrentUser\n$supported = $true\n$administrator = $true\nfunction ReadPolicy {");
        let script = script.replace("Global\\Tracel.UpdatePolicy.v1", &format!("Local\\{id}"));
        assert!(script.contains("$machine = [Microsoft.Win32.Registry]::CurrentUser"));
        assert!(!script.contains("SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU"));
        assert!(!script.contains("SOFTWARE\\Tracel\\UpdatePolicy"));
        let operation = |mode: &str| format!("(TestPolicy '{mode}' | ConvertFrom-Json)");
        let test = format!(
            r#"
$store = [Microsoft.Win32.Registry]::CurrentUser
$fixture = 'SOFTWARE\{id}\AU'
function Check($ok, $message) {{ if (!$ok) {{ throw $message }} }}
function TestPolicy($mode) {{
{script}
}}
try {{
  $key = $store.CreateSubKey($fixture)
  $key.SetValue('NoAutoUpdate', 0, [Microsoft.Win32.RegistryValueKind]::DWord)
  $key.SetValue('AUOptions', 3, [Microsoft.Win32.RegistryValueKind]::DWord)
  $key.Dispose()
  $first = {disable}
  Check ($first.disabled -and $first.owned) 'Disable failed'
  $second = {disable}
  Check ($first.since -eq $second.since) 'Idempotent disable lost its original timestamp'
  $restored = {restore}
  Check (!$restored.disabled -and !$restored.owned) 'Restore failed'
  $key = $store.OpenSubKey($fixture, $true)
  Check ($key.GetValue('NoAutoUpdate') -eq 0 -and $key.GetValue('AUOptions') -eq 3) 'Original settings were not preserved'
  $key.DeleteValue('NoAutoUpdate'); $key.Dispose()
  $null = {disable}; $null = {restore}
  $key = $store.OpenSubKey($fixture, $true)
  Check ($null -eq $key.GetValue('NoAutoUpdate')) 'Originally absent value was not removed'
  $key.SetValue('NoAutoUpdate', 1, [Microsoft.Win32.RegistryValueKind]::DWord); $key.Dispose()
  $rejected = $false
  try {{ $null = {disable} }} catch {{ $rejected = $true }}
  Check $rejected 'External disabled policy was claimed'
  $key = $store.OpenSubKey($fixture, $true); $key.SetValue('NoAutoUpdate', 0); $key.Dispose()
  $null = {disable}
  $key = $store.OpenSubKey($fixture, $true); $key.SetValue('NoAutoUpdate', 2); $key.Dispose()
  $rejected = $false
  try {{ $null = {restore} }} catch {{ $rejected = $true }}
  Check $rejected 'External policy change was overwritten'
  $key = $store.OpenSubKey($fixture)
  Check ($key.GetValue('NoAutoUpdate') -eq 2) 'Conflict was not preserved'; $key.Dispose()
  '{{"ok":true}}'
}} finally {{ $store.DeleteSubKeyTree('SOFTWARE\{id}', $false) }}
"#,
            disable = operation("disable"),
            restore = operation("restore")
        );
        let result: serde_json::Value = super::run_json(&test).unwrap();
        assert_eq!(result["ok"], true);
    }
}
