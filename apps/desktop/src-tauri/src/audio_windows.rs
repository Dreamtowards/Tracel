use super::{Device, Session, Snapshot};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use windows::{
    core::{implement, AgileReference, Interface, Ref, PWSTR},
    Win32::{
        Foundation::PROPERTYKEY,
        Media::Audio::{Endpoints::IAudioMeterInformation, *},
        System::Com::{StructuredStorage::PropVariantToStringAlloc, *},
    },
};

fn text(value: PWSTR) -> String {
    if value.is_null() {
        return String::new();
    }
    unsafe {
        let result = value.to_string().unwrap_or_default();
        CoTaskMemFree(Some(value.0.cast()));
        result
    }
}
fn id(device: &IMMDevice) -> windows::core::Result<String> {
    unsafe { device.GetId().map(text) }
}
fn device_name(device: &IMMDevice) -> String {
    // PKEY_Device_FriendlyName; no FunctionDiscovery dependency needed for a property key.
    const FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY {
        fmtid: windows::core::GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
        pid: 14,
    };
    unsafe {
        device
            .OpenPropertyStore(STGM_READ)
            .and_then(|p| p.GetValue(&FRIENDLY_NAME))
            .and_then(|p| PropVariantToStringAlloc(&p))
            .map(text)
            .unwrap_or_else(|_| "Audio device".into())
    }
}
type Pending = Arc<Mutex<Vec<AgileReference<IAudioSessionControl>>>>;
#[implement(IAudioSessionNotification)]
struct Notification {
    pending: Pending,
}
impl IAudioSessionNotification_Impl for Notification_Impl {
    fn OnSessionCreated(&self, session: Ref<IAudioSessionControl>) -> windows::core::Result<()> {
        if let Some(session) = session.as_ref() {
            if let Ok(reference) = AgileReference::new(session) {
                if let Ok(mut pending) = self.pending.lock() {
                    if pending.len() < 256 {
                        pending.push(reference);
                    }
                }
            }
        }
        Ok(()) // Enumeration is also refreshed, including if marshalling is unavailable.
    }
}
struct Meter {
    control: IAudioSessionControl2,
    meter: Option<IAudioMeterInformation>,
    volume: Option<ISimpleAudioVolume>,
    info: Session,
}
impl Meter {
    fn new(device_id: &str, control: IAudioSessionControl) -> windows::core::Result<Self> {
        let control: IAudioSessionControl2 = control.cast()?;
        unsafe {
            let instance = text(control.GetSessionInstanceIdentifier()?);
            let system_sounds = control.IsSystemSoundsSession() == windows::core::HRESULT(0);
            // AUDCLNT_S_NO_SINGLE_PROCESS is success: PID identifies only the creator.
            let mut process_id = 0;
            let pid_result = (Interface::vtable(&control).GetProcessId)(
                Interface::as_raw(&control),
                &mut process_id,
            );
            pid_result.ok()?;
            let multi_process = pid_result.0 == 0x0889000d;
            let executable = executable(process_id);
            let display = text(control.GetDisplayName().unwrap_or_default());
            let name = if system_sounds {
                "System sounds".into()
            } else if !display.is_empty() && !display.starts_with('@') {
                display
            } else {
                executable
                    .as_ref()
                    .and_then(|p| std::path::Path::new(p).file_name())
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_else(|| format!("PID {process_id}"))
            };
            Ok(Self {
                meter: control.cast().ok(),
                volume: control.cast().ok(),
                info: Session {
                    id: format!("{device_id}|{instance}"),
                    device_id: device_id.into(),
                    process_id,
                    name,
                    executable,
                    system_sounds,
                    multi_process,
                    state: "inactive".into(),
                    peak_percent: None,
                    volume_percent: None,
                    muted: None,
                    last_heard_at_ms: None,
                    held_peak_percent: 0.0,
                },
                control,
            })
        }
    }
    fn read(&mut self, errors: &mut Vec<String>) -> Option<Session> {
        unsafe {
            let state = match self.control.GetState() {
                Ok(state) => state,
                Err(error) => {
                    errors.push(format!("{}: {error}", self.info.name));
                    return None;
                }
            };
            if state == AudioSessionStateExpired {
                return None;
            }
            self.info.state = if state == AudioSessionStateActive {
                "active"
            } else {
                "inactive"
            }
            .into();
            self.info.peak_percent = self.meter.as_ref().and_then(|m| match m.GetPeakValue() {
                Ok(value) => Some((value as f64 * 100.0).clamp(0.0, 100.0)),
                Err(error) => {
                    errors.push(format!("{} meter: {error}", self.info.name));
                    None
                }
            });
            if self.meter.is_none() {
                errors.push(format!("{}: session meter unavailable", self.info.name));
            }
            self.info.volume_percent = self
                .volume
                .as_ref()
                .and_then(|v| v.GetMasterVolume().ok())
                .map(|v| v as f64 * 100.0);
            self.info.muted = self
                .volume
                .as_ref()
                .and_then(|v| v.GetMute().ok())
                .map(|v| v.as_bool());
            Some(self.info.clone())
        }
    }
}
fn executable(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }
    unsafe {
        use windows_sys::Win32::{Foundation::CloseHandle, System::Threading::*};
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut buffer = vec![0u16; 32768];
        let mut size = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size);
        CloseHandle(handle);
        (ok != 0).then(|| String::from_utf16_lossy(&buffer[..size as usize]))
    }
}
struct Output {
    manager: IAudioSessionManager2,
    notification: IAudioSessionNotification,
    pending: Pending,
    meters: BTreeMap<String, Meter>,
}
impl Drop for Output {
    fn drop(&mut self) {
        unsafe {
            let _ = self
                .manager
                .UnregisterSessionNotification(&self.notification);
        }
    }
}
impl Output {
    fn new(device: &IMMDevice) -> windows::core::Result<Self> {
        unsafe {
            let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
            let pending = Arc::new(Mutex::new(Vec::new()));
            let notification: IAudioSessionNotification = Notification {
                pending: pending.clone(),
            }
            .into();
            manager.RegisterSessionNotification(&notification)?;
            Ok(Self {
                manager,
                notification,
                pending,
                meters: BTreeMap::new(),
            })
        }
    }
    fn add(&mut self, device_id: &str, control: IAudioSessionControl, errors: &mut Vec<String>) {
        // Keep previously acquired controls/meters; do not repeatedly resolve process paths.
        let key = unsafe {
            control
                .cast::<IAudioSessionControl2>()
                .and_then(|c| c.GetSessionInstanceIdentifier())
                .map(text)
        };
        if let Ok(key) = key {
            if self.meters.contains_key(&format!("{device_id}|{key}")) {
                return;
            }
        }
        if self.meters.len() >= 256 {
            errors.push("Audio session limit reached (256 per output).".into());
            return;
        }
        match Meter::new(device_id, control) {
            Ok(meter) => {
                self.meters.insert(meter.info.id.clone(), meter);
            }
            Err(error) => errors.push(format!("Audio session: {error}")),
        }
    }
    fn refresh(&mut self, device_id: &str, errors: &mut Vec<String>) -> windows::core::Result<()> {
        unsafe {
            let list = self.manager.GetSessionEnumerator()?;
            let count = list.GetCount()?;
            if count > 256 {
                errors.push("Audio session limit reached (256 per output).".into());
            }
            for i in 0..count.min(256) {
                match list.GetSession(i) {
                    Ok(control) => self.add(device_id, control, errors),
                    Err(e) => errors.push(e.to_string()),
                }
            }
        }
        Ok(())
    }
    fn read(&mut self, device_id: &str, errors: &mut Vec<String>) -> Vec<Session> {
        let pending = self
            .pending
            .lock()
            .map(|mut p| std::mem::take(&mut *p))
            .unwrap_or_default();
        for reference in pending {
            match reference.resolve() {
                Ok(control) => self.add(device_id, control, errors),
                Err(error) => errors.push(error.to_string()),
            }
        }
        let mut rows = Vec::new();
        self.meters.retain(|_, meter| {
            if let Some(session) = meter.read(errors) {
                rows.push(session);
                true
            } else {
                false
            }
        });
        rows
    }
}
struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}
pub struct Reader {
    outputs: BTreeMap<String, Output>,
    enumerator: IMMDeviceEnumerator,
    devices: Vec<Device>,
    refresh_at: Option<Instant>,
    refresh_errors: Vec<String>,
    _apartment: Apartment, // Last field: release all COM objects before uninitializing.
}
impl Reader {
    pub fn new() -> Result<Self, String> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED)
                .ok()
                .map_err(|e| e.to_string())?;
            let apartment = Apartment;
            let enumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| e.to_string())?;
            Ok(Self {
                outputs: BTreeMap::new(),
                enumerator,
                devices: Vec::new(),
                refresh_at: None,
                refresh_errors: Vec::new(),
                _apartment: apartment,
            })
        }
    }
    fn refresh(&mut self) -> Result<(), String> {
        let mut devices = Vec::new();
        let mut errors = Vec::new();
        unsafe {
            let list = self
                .enumerator
                .EnumAudioEndpoints(eAll, DEVICE_STATE_ACTIVE)
                .map_err(|e| e.to_string())?;
            let count = list.GetCount().map_err(|e| e.to_string())?;
            if count > 64 {
                errors.push("Audio device limit reached (64).".into());
            }
            let enumerator = &self.enumerator;
            let defaults: Vec<_> = [(eRender, "output"), (eCapture, "input")]
                .into_iter()
                .flat_map(|(flow, direction)| {
                    [
                        (eConsole, "console"),
                        (eMultimedia, "multimedia"),
                        (eCommunications, "communications"),
                    ]
                    .into_iter()
                    .filter_map(move |(role, label)| {
                        enumerator
                            .GetDefaultAudioEndpoint(flow, role)
                            .and_then(|d| id(&d))
                            .ok()
                            .map(|id| (id, direction, label))
                    })
                })
                .collect();
            for i in 0..count.min(64) {
                let endpoint = list.Item(i).map_err(|e| e.to_string())?;
                let endpoint_id = id(&endpoint).map_err(|e| e.to_string())?;
                let flow = endpoint
                    .cast::<IMMEndpoint>()
                    .and_then(|e| e.GetDataFlow())
                    .map_err(|e| e.to_string())?;
                let direction = if flow == eRender { "output" } else { "input" };
                devices.push(Device {
                    id: endpoint_id.clone(),
                    name: device_name(&endpoint),
                    direction: direction.into(),
                    default_roles: defaults
                        .iter()
                        .filter(|(id, d, _)| id == &endpoint_id && *d == direction)
                        .map(|(_, _, r)| r.to_string())
                        .collect(),
                });
                if flow == eRender {
                    if !self.outputs.contains_key(&endpoint_id) {
                        match Output::new(&endpoint) {
                            Ok(output) => {
                                self.outputs.insert(endpoint_id.clone(), output);
                            }
                            Err(error) => {
                                errors.push(format!("{}: {error}", device_name(&endpoint)));
                                continue;
                            }
                        }
                    }
                    if let Err(error) = self
                        .outputs
                        .get_mut(&endpoint_id)
                        .unwrap()
                        .refresh(&endpoint_id, &mut errors)
                    {
                        errors.push(format!("{}: {error}", device_name(&endpoint)));
                        self.outputs.remove(&endpoint_id);
                    }
                }
            }
        }
        self.outputs.retain(|id, _| {
            devices
                .iter()
                .any(|d| d.id == *id && d.direction == "output")
        });
        self.devices = devices;
        self.refresh_errors = errors;
        self.refresh_at = Some(Instant::now());
        Ok(())
    }
    pub fn read(&mut self) -> Result<Snapshot, String> {
        if self
            .refresh_at
            .is_none_or(|t| t.elapsed() >= Duration::from_secs(1))
        {
            self.refresh()?;
        }
        let mut errors = self.refresh_errors.clone();
        let sessions = self
            .outputs
            .iter_mut()
            .flat_map(|(id, output)| output.read(id, &mut errors))
            .collect();
        errors.truncate(24);
        Ok(Snapshot {
            monitoring: true,
            captured_at_ms: crate::telemetry::now_ms(),
            devices: self.devices.clone(),
            sessions,
            errors,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn new_silent_session_is_discovered_without_waiting_for_reenumeration() {
        let mut reader = Reader::new().unwrap();
        let before = reader.read().unwrap();
        unsafe {
            let Ok(device) = reader
                .enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
            else {
                return;
            };
            // Initialize a unique shared session without Start/GetBuffer: no sound is played.
            let client: IAudioClient = device.Activate(CLSCTX_ALL, None).unwrap();
            let format = client.GetMixFormat().unwrap();
            let guid = windows::core::GUID::from_u128(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
            );
            let initialized = client.Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                0,
                2_000_000,
                0,
                format,
                Some(&guid),
            );
            CoTaskMemFree(Some(format.cast()));
            initialized.unwrap();
            let deadline = Instant::now() + Duration::from_secs(2);
            loop {
                // Suppress periodic enumeration to specifically exercise session notifications.
                reader.refresh_at = Some(Instant::now());
                let snapshot = reader.read().unwrap();
                if snapshot.sessions.iter().any(|s| {
                    s.process_id == std::process::id()
                        && !before.sessions.iter().any(|old| old.id == s.id)
                }) {
                    break;
                }
                assert!(
                    Instant::now() < deadline,
                    "new session was not delivered through notification"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
        }
    }
}
