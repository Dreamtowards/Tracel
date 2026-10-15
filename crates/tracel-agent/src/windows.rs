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

pub fn activity(
    settings: &super::CollectionSettings,
    timestamp: u64,
) -> (tracel_core::ActivityObservation, Vec<String>) {
    use windows_sys::Win32::{
        System::SystemInformation::GetTickCount,
        UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
    };
    let mut result = tracel_core::ActivityObservation::default();
    let mut errors = Vec::new();
    if settings.foreground {
        let window = unsafe { GetForegroundWindow() };
        if !window.is_null() {
            let mut pid = 0;
            unsafe {
                GetWindowThreadProcessId(window, &mut pid);
            }
            let mut title = vec![0u16; 32768];
            let len = unsafe { GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32) };
            result.foreground = Some(tracel_core::WindowObservation {
                process: application_process(pid, timestamp),
                window_id: format!("0x{:x}", window as usize),
                title: String::from_utf16_lossy(&title[..len.max(0) as usize]),
            });
        } else {
            errors.push("Foreground: no accessible foreground window".into());
        }
    }
    if settings.background {
        unsafe extern "system" fn window_callback(
            window: windows_sys::Win32::Foundation::HWND,
            data: isize,
        ) -> i32 {
            let pids = &mut *(data as *mut std::collections::BTreeSet<u32>);
            if IsWindowVisible(window) != 0
                && GetWindow(window, GW_OWNER).is_null()
                && window != GetShellWindow()
            {
                let mut pid = 0;
                GetWindowThreadProcessId(window, &mut pid);
                if pid != 0 {
                    pids.insert(pid);
                }
            }
            1
        }
        let mut pids = std::collections::BTreeSet::<u32>::new();
        if unsafe { EnumWindows(Some(window_callback), &mut pids as *mut _ as isize) } == 0 {
            errors.push(format!("Desktop apps: {}", std::io::Error::last_os_error()));
        } else if pids.len() > 256 {
            errors.push("Desktop application limit exceeded; snapshot omitted".into());
        } else {
            result.background = Some(
                pids.into_iter()
                    .map(|pid| application_process(pid, timestamp))
                    .collect(),
            );
        }
    }
    if settings.idle {
        let mut last = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if unsafe { GetLastInputInfo(&mut last) } != 0 {
            result.idle_ms = Some(unsafe { GetTickCount() }.wrapping_sub(last.dwTime) as u64);
        } else {
            errors.push(format!("Idle: {}", std::io::Error::last_os_error()));
        }
    }
    (result, errors)
}
fn application_process(pid: u32, timestamp: u64) -> tracel_core::ProcessObservation {
    use windows_sys::Win32::System::Threading::GetProcessTimes;
    let mut executable = None;
    let mut instance_id = format!("unresolved:{pid}:{timestamp}");
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if !handle.is_null() {
            let mut creation: FILETIME = std::mem::zeroed();
            let mut exit = creation;
            let mut kernel = creation;
            let mut user = creation;
            if GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) != 0 {
                let ticks =
                    ((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64;
                instance_id = format!("{pid}:{ticks}");
            }
            let mut path = vec![0u16; 32768];
            let mut size = path.len() as u32;
            if QueryFullProcessImageNameW(handle, 0, path.as_mut_ptr(), &mut size) != 0 {
                executable = Some(String::from_utf16_lossy(&path[..size as usize]));
            }
            CloseHandle(handle);
        }
    }
    let name = executable
        .as_ref()
        .and_then(|p| std::path::Path::new(p).file_name())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| format!("PID {pid}"));
    tracel_core::ProcessObservation {
        instance_id,
        process_id: pid,
        name,
        executable,
    }
}
