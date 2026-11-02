//! Per-user Windows logon startup. This never changes collection preferences.
use serde::Serialize;

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "Tracel Activity";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub needs_repair: bool,
    pub executable_path: String,
    pub registered_path: Option<String>,
}

fn executable_path() -> Result<String, String> {
    let path = std::env::current_exe().map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn command(path: &str) -> String {
    format!("\"{path}\"")
}

fn registered_path(value: &str) -> Option<&str> {
    let path = value.strip_prefix('"')?.strip_suffix('"')?;
    let name = std::path::Path::new(path).file_name()?.to_str()?;
    (name.eq_ignore_ascii_case("Tracel.exe") || name.eq_ignore_ascii_case("tracel-desktop.exe"))
        .then_some(path)
}

#[cfg(windows)]
mod registry {
    use super::{command, executable_path, registered_path, Status, RUN_KEY, VALUE_NAME};
    use std::{ptr, sync::Mutex};
    use windows_sys::Win32::{
        Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS},
        System::Registry::{
            RegCloseKey, RegCreateKeyW, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW,
            RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SZ,
        },
    };

    static MUTATION: Mutex<()> = Mutex::new(());

    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                RegCloseKey(self.0);
            }
        }
    }
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
    fn failure(action: &str, code: u32) -> String {
        format!("Could not {action} Windows startup entry (Windows error {code}).")
    }
    fn open(path: &str, create: bool, writable: bool) -> Result<Option<Key>, String> {
        let mut key = ptr::null_mut();
        let path = wide(path);
        let code = if create {
            unsafe { RegCreateKeyW(HKEY_CURRENT_USER, path.as_ptr(), &mut key) }
        } else {
            unsafe {
                RegOpenKeyExW(
                    HKEY_CURRENT_USER,
                    path.as_ptr(),
                    0,
                    KEY_QUERY_VALUE | if writable { KEY_SET_VALUE } else { 0 },
                    &mut key,
                )
            }
        };
        if !create && code == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if code != ERROR_SUCCESS {
            return Err(failure("open", code));
        }
        Ok(Some(Key(key)))
    }
    fn read(key: &Key, value_name: &str) -> Result<Option<String>, String> {
        let name = wide(value_name);
        let mut kind = 0;
        let mut bytes = 0;
        let code = unsafe {
            RegQueryValueExW(
                key.0,
                name.as_ptr(),
                ptr::null(),
                &mut kind,
                ptr::null_mut(),
                &mut bytes,
            )
        };
        if code == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if code != ERROR_SUCCESS {
            return Err(failure("read", code));
        }
        if kind != REG_SZ || bytes > 32_768 || bytes % 2 != 0 || bytes < 2 {
            return Err(
                "The existing Tracel startup entry has an unexpected format. No changes were made."
                    .into(),
            );
        }
        let mut data = vec![0u16; bytes as usize / 2];
        let code = unsafe {
            RegQueryValueExW(
                key.0,
                name.as_ptr(),
                ptr::null(),
                &mut kind,
                data.as_mut_ptr().cast(),
                &mut bytes,
            )
        };
        if code != ERROR_SUCCESS {
            return Err(failure("read", code));
        }
        if kind != REG_SZ || bytes as usize > data.len() * 2 || bytes % 2 != 0 {
            return Err(
                "The Tracel startup entry changed while it was being read. Try again.".into(),
            );
        }
        data.truncate(bytes as usize / 2);
        if data.last() == Some(&0) {
            data.pop();
        }
        String::from_utf16(&data)
            .map(Some)
            .map_err(|_| "The Tracel startup entry contains invalid text.".into())
    }
    fn status_for(key: Option<&Key>, value_name: &str, current: String) -> Result<Status, String> {
        let value = key.map(|key| read(key, value_name)).transpose()?.flatten();
        let registered = value
            .as_deref()
            .map(|raw| {
                registered_path(raw).ok_or(
                    "A different startup command uses the Tracel entry name. No changes were made.",
                )
            })
            .transpose()?;
        let enabled = registered.is_some();
        let needs_repair = registered.is_some_and(|path| !path.eq_ignore_ascii_case(&current));
        Ok(Status {
            enabled,
            needs_repair,
            executable_path: current,
            registered_path: registered.map(str::to_owned),
        })
    }
    fn status_at(path: &str, value_name: &str, current: String) -> Result<Status, String> {
        let key = open(path, false, false)?;
        status_for(key.as_ref(), value_name, current)
    }
    fn set_at(
        path: &str,
        value_name: &str,
        current: String,
        enabled: bool,
    ) -> Result<Status, String> {
        let _guard = MUTATION.lock().map_err(|error| error.to_string())?;
        let key = open(path, enabled, true)?;
        let _previous = status_for(key.as_ref(), value_name, current.clone())?;
        if let Some(key) = key.as_ref() {
            let name = wide(value_name);
            let code = if enabled {
                let value = wide(&command(&current));
                unsafe {
                    RegSetValueExW(
                        key.0,
                        name.as_ptr(),
                        0,
                        REG_SZ,
                        value.as_ptr().cast(),
                        (value.len() * 2) as u32,
                    )
                }
            } else {
                unsafe { RegDeleteValueW(key.0, name.as_ptr()) }
            };
            if code != ERROR_SUCCESS && !(code == ERROR_FILE_NOT_FOUND && !enabled) {
                return Err(failure("update", code));
            }
        }
        status_for(key.as_ref(), value_name, current)
    }
    pub fn status() -> Result<Status, String> {
        status_at(RUN_KEY, VALUE_NAME, executable_path()?)
    }
    pub fn set(enabled: bool) -> Result<Status, String> {
        set_at(RUN_KEY, VALUE_NAME, executable_path()?, enabled)
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows_sys::Win32::System::Registry::RegDeleteKeyW;

        #[test]
        fn isolated_registry_entry_roundtrips_and_repairs_a_moved_exe() {
            let path = format!(
                r"Software\TracelAutostartTest{}_{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let first = r"C:\Tracel old\Tracel.exe".to_string();
            let second = r"C:\Tracel new\Tracel.exe".to_string();
            assert!(!status_at(&path, VALUE_NAME, first.clone()).unwrap().enabled);
            assert!(
                set_at(&path, VALUE_NAME, first.clone(), true)
                    .unwrap()
                    .enabled
            );
            let moved = status_at(&path, VALUE_NAME, second.clone()).unwrap();
            assert!(moved.enabled && moved.needs_repair);
            let repaired = set_at(&path, VALUE_NAME, second, true).unwrap();
            assert!(repaired.enabled && !repaired.needs_repair);
            assert!(!set_at(&path, VALUE_NAME, first, false).unwrap().enabled);
            assert_eq!(
                unsafe { RegDeleteKeyW(HKEY_CURRENT_USER, wide(&path).as_ptr()) },
                ERROR_SUCCESS
            );
        }
    }
}

#[cfg(windows)]
pub use registry::{set, status};

#[cfg(not(windows))]
pub fn status() -> Result<Status, String> {
    Err("Requires Windows".into())
}
#[cfg(not(windows))]
pub fn set(_: bool) -> Result<Status, String> {
    Err("Requires Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_command_is_quoted_and_only_our_exe_names_are_recognized() {
        assert_eq!(
            command(r"C:\Program Files\Tracel\Tracel.exe"),
            r#""C:\Program Files\Tracel\Tracel.exe""#
        );
        assert_eq!(
            registered_path(r#""C:\Tracel\Tracel.exe""#),
            Some(r"C:\Tracel\Tracel.exe")
        );
        assert!(registered_path(r#""C:\Other\other.exe""#).is_none());
        assert!(registered_path(r#""C:\Tracel\Tracel.exe" --other"#).is_none());
    }
}
