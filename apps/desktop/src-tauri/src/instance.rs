//! Keep a logon launch and a manual launch from starting two SQLite writers.
#[cfg(windows)]
mod windows {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE},
        System::Threading::CreateMutexW,
        UI::WindowsAndMessaging::{FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE},
    };

    pub struct Guard(HANDLE);
    impl Drop for Guard {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }

    pub fn acquire() -> Result<Option<Guard>, String> {
        let name = wide("Local\\Tracel.Activity.Desktop.v1");
        let handle = unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(format!(
                "Could not protect Tracel from duplicate launches (Windows error {}).",
                unsafe { GetLastError() }
            ));
        }
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe {
                CloseHandle(handle);
            }
            // The splash can be the only visible window while React starts.
            for title in ["Tracel — Starting", "Tracel Activity"] {
                let hwnd = unsafe { FindWindowW(std::ptr::null(), wide(title).as_ptr()) };
                if !hwnd.is_null() {
                    unsafe {
                        ShowWindow(hwnd, SW_RESTORE);
                        SetForegroundWindow(hwnd);
                    }
                    break;
                }
            }
            return Ok(None);
        }
        Ok(Some(Guard(handle)))
    }
}

#[cfg(windows)]
pub use windows::acquire;

#[cfg(not(windows))]
pub fn acquire() -> Result<Option<()>, String> {
    Ok(Some(()))
}
