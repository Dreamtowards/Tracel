#[cfg(windows)]
fn execution_flags(enabled: bool) -> u32 {
    use windows_sys::Win32::System::Power::{ES_CONTINUOUS, ES_SYSTEM_REQUIRED};
    ES_CONTINUOUS | if enabled { ES_SYSTEM_REQUIRED } else { 0 }
}

pub fn keep_awake(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Power::SetThreadExecutionState;
        // Request system activity only. Never hold the display on or issue monitor commands.
        // SAFETY: called and released on the single collector worker thread.
        if unsafe { SetThreadExecutionState(execution_flags(enabled)) } == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err("Windows only".into())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use windows_sys::Win32::System::Power::{
        ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
    };

    #[test]
    fn prevent_sleep_allows_display_timeout_and_releases_on_disable() {
        assert_eq!(execution_flags(true), ES_CONTINUOUS | ES_SYSTEM_REQUIRED);
        assert_eq!(execution_flags(true) & ES_DISPLAY_REQUIRED, 0);
        assert_eq!(execution_flags(false), ES_CONTINUOUS);
    }
}
