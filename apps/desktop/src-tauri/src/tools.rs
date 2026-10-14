pub fn keep_awake(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Power::{
            SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
        };
        let flags = ES_CONTINUOUS
            | if enabled {
                ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED
            } else {
                0
            };
        // SAFETY: called and released on the single collector worker thread.
        if unsafe { SetThreadExecutionState(flags) } == 0 {
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

pub fn turn_off_display() -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SendMessageTimeoutW, HWND_BROADCAST, SC_MONITORPOWER, SMTO_ABORTIFHUNG, WM_SYSCOMMAND,
        };
        // Standard monitor-power request; no overlay, input hooks, or suspend call.
        let result = unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST,
                WM_SYSCOMMAND,
                SC_MONITORPOWER as usize,
                2,
                SMTO_ABORTIFHUNG,
                1000,
                std::ptr::null_mut(),
            )
        };
        if result == 0 {
            return Err("Windows did not acknowledge the display-off request (a window may have timed out).".into());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("Windows only".into())
    }
}
