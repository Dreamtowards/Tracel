use serde::Serialize;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileProcess {
    process_id: u32,
    started_at_ticks: String,
    name: String,
    service: String,
    executable: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileUsage {
    path: String,
    checked_at_ms: u64,
    modified_at_ms: Option<u64>,
    processes: Vec<FileProcess>,
}

pub fn inspect(path: &str) -> Result<FileUsage, String> {
    let file = Path::new(path);
    if !file.is_absolute() || path.contains('\0') {
        return Err("Choose an absolute file path.".into());
    }
    let metadata = std::fs::metadata(file).map_err(|e| format!("Cannot access file: {e}"))?;
    if !metadata.is_file() {
        return Err("Choose a file, not a folder.".into());
    }
    let modified_at_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_millis() as u64);
    // Metadata and Restart Manager query only; no file content, shutdown or restart calls.
    let processes = platform::users(file)?;
    Ok(FileUsage {
        path: path.into(),
        checked_at_ms: crate::telemetry::now_ms(),
        modified_at_ms,
        processes,
    })
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::os::windows::fs::OpenOptionsExt;

    #[test]
    fn rejects_relative_paths_and_directories() {
        assert!(inspect("relative.txt").unwrap_err().contains("absolute"));
        assert!(inspect(&std::env::temp_dir().to_string_lossy())
            .unwrap_err()
            .contains("folder"));
    }

    #[test]
    fn reports_live_file_holder_and_releases_query_resources() {
        let path =
            std::env::temp_dir().join(format!("tracel-file-usage-test-{}.txt", std::process::id()));
        std::fs::write(&path, "Tracel test fixture").unwrap();
        let holder = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)
            .unwrap();
        let result = inspect(&path.to_string_lossy());
        drop(holder);
        // Remove only our test fixture. Querying must not leave another handle blocking deletion.
        let cleanup = std::fs::remove_file(&path);
        let result = result.unwrap();
        assert!(result.modified_at_ms.is_some());
        assert!(result
            .processes
            .iter()
            .any(|process| process.process_id == std::process::id()));
        assert!(cleanup.is_ok());
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    pub fn users(_: &Path) -> Result<Vec<FileProcess>, String> {
        Err("File usage inspection requires Windows.".into())
    }
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, ERROR_MORE_DATA, ERROR_SUCCESS, FILETIME},
        System::{
            RestartManager::*,
            Threading::{
                GetProcessTimes, OpenProcess, QueryFullProcessImageNameW,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
    };

    struct Session(u32);
    impl Drop for Session {
        fn drop(&mut self) {
            // SAFETY: this session was successfully created and is owned by this guard.
            unsafe {
                RmEndSession(self.0);
            }
        }
    }
    fn check(code: u32) -> Result<(), String> {
        if code == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(format!(
                "Windows file usage query failed ({code}): {}",
                std::io::Error::from_raw_os_error(code as i32)
            ))
        }
    }
    fn text(value: &[u16]) -> String {
        String::from_utf16_lossy(
            &value[..value.iter().position(|c| *c == 0).unwrap_or(value.len())],
        )
    }
    fn ticks(value: FILETIME) -> u64 {
        (u64::from(value.dwHighDateTime) << 32) | u64::from(value.dwLowDateTime)
    }

    fn executable(process: RM_UNIQUE_PROCESS) -> Option<String> {
        // SAFETY: query-only access. The handle is closed below on every branch.
        let handle =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process.dwProcessId) };
        if handle.is_null() {
            return None;
        }
        let mut created = FILETIME::default();
        let mut exited = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        let mut path = vec![0u16; 32768];
        let mut length = path.len() as u32;
        // SAFETY: all buffers are correctly sized and remain live. Match creation time to avoid PID reuse.
        let matched =
            unsafe { GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) }
                != 0
                && ticks(created) == ticks(process.ProcessStartTime);
        let found = matched
            && unsafe { QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut length) }
                != 0;
        unsafe {
            CloseHandle(handle);
        }
        found.then(|| String::from_utf16_lossy(&path[..length as usize]))
    }

    pub fn users(path: &Path) -> Result<Vec<FileProcess>, String> {
        let mut session = 0;
        let mut key = [0u16; CCH_RM_SESSION_KEY as usize + 1];
        // SAFETY: writable handle/key buffers, reserved flags are zero.
        check(unsafe { RmStartSession(&mut session, 0, key.as_mut_ptr()) })?;
        let session = Session(session);
        let filename: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let files = [filename.as_ptr()];
        // SAFETY: one live UTF-16 filename; no applications or services are registered explicitly.
        check(unsafe {
            RmRegisterResources(session.0, 1, files.as_ptr(), 0, ptr::null(), 0, ptr::null())
        })?;
        let mut processes = Vec::<RM_PROCESS_INFO>::new();
        // Processes can appear/disappear between calls; retry with the requested size, with a bound.
        for _ in 0..5 {
            let mut needed = 0;
            let mut count = processes.len() as u32;
            let mut reasons = 0;
            let buffer = if processes.is_empty() {
                ptr::null_mut()
            } else {
                processes.as_mut_ptr()
            };
            // SAFETY: count equals the initialized buffer size; API reports actual/required count.
            let code =
                unsafe { RmGetList(session.0, &mut needed, &mut count, buffer, &mut reasons) };
            if code == ERROR_MORE_DATA {
                if needed > 65536 {
                    return Err("Windows reported too many file users.".into());
                }
                processes.resize(needed as usize, RM_PROCESS_INFO::default());
                continue;
            }
            check(code)?;
            processes.truncate(count as usize);
            let mut result: Vec<_> = processes
                .into_iter()
                .map(|info| FileProcess {
                    process_id: info.Process.dwProcessId,
                    started_at_ticks: ticks(info.Process.ProcessStartTime).to_string(),
                    name: text(&info.strAppName),
                    service: text(&info.strServiceShortName),
                    executable: executable(info.Process),
                })
                .collect();
            result.sort_by_key(|process| process.process_id);
            result.dedup_by(|a, b| {
                a.process_id == b.process_id && a.started_at_ticks == b.started_at_ticks
            });
            return Ok(result);
        }
        Err("File users changed during the query. Refresh and try again.".into())
    }
}
