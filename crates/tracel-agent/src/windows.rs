use super::{CpuTimes, ForegroundInfo};
use windows_sys::Win32::{
    Foundation::{CloseHandle, FILETIME},
    System::{
        SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
        Threading::{
            GetSystemTimes, OpenProcess, QueryFullProcessImageNameW,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
    },
    UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId},
};

pub fn cpu_times() -> Result<CpuTimes, String> {
    let mut idle: FILETIME = unsafe { std::mem::zeroed() };
    let mut kernel = idle;
    let mut user = idle;
    // SAFETY: writable FILETIME buffers live throughout this synchronous call.
    if unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let ticks =
        |time: FILETIME| (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime);
    Ok(CpuTimes {
        idle: ticks(idle),
        kernel: ticks(kernel),
        user: ticks(user),
    })
}

pub fn memory() -> Result<(u64, u64), String> {
    let mut status: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    // SAFETY: initialized length and correctly sized writable structure.
    if unsafe { GlobalMemoryStatusEx(&mut status) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok((
        status.ullTotalPhys.saturating_sub(status.ullAvailPhys),
        status.ullTotalPhys,
    ))
}

pub fn foreground_info(captured_at_ms: u64) -> Result<ForegroundInfo, String> {
    // SAFETY: reads the current desktop's foreground HWND; a vanished window returns no text.
    let window = unsafe { GetForegroundWindow() };
    if window.is_null() {
        return Err("No foreground window is available".into());
    }
    let mut pid = 0;
    let mut title = vec![0u16; 32768];
    unsafe {
        GetWindowThreadProcessId(window, &mut pid);
    }
    let length = unsafe { GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32) };
    let mut notes = vec!["URL is not collected in this version; window title is not a URL.".into()];
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    let executable = if process.is_null() {
        notes.push(
            "Process path is unavailable (the process may be protected or have exited).".into(),
        );
        None
    } else {
        let mut path = vec![0u16; 32768];
        let mut size = path.len() as u32;
        let success =
            unsafe { QueryFullProcessImageNameW(process, 0, path.as_mut_ptr(), &mut size) };
        unsafe {
            CloseHandle(process);
        }
        if success != 0 {
            Some(String::from_utf16_lossy(&path[..size as usize]))
        } else {
            notes.push("Process path could not be read.".into());
            None
        }
    };
    Ok(ForegroundInfo {
        captured_at_ms,
        window_id: format!("0x{:x}", window as usize),
        process_id: pid,
        title: String::from_utf16_lossy(&title[..length.max(0) as usize]),
        executable,
        url: None,
        notes,
    })
}
