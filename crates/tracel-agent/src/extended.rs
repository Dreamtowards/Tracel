//! Windows system sources. No subprocesses, recording, or bundled runtimes.
use super::{CollectionSettings, MediaObservation};
use ::windows::{
    Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager as MediaManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    },
    Win32::{
        Media::Audio::{Endpoints::IAudioMeterInformation, *},
        System::{Com::*, WinRT::*},
    },
};
use std::{collections::BTreeMap, time::Instant};
use windows_sys::Win32::{NetworkManagement::IpHelper::*, System::Performance::*};

#[derive(Default)]
pub struct Reader {
    network: Option<(Instant, BTreeMap<u32, (u64, u64)>)>,
    disk: Option<Disk>,
    apartment: Option<Apartment>,
}
struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            RoUninitialize();
        }
    }
}
impl Reader {
    pub fn reset(&mut self) {
        self.network = None;
        self.disk = None;
    }
    pub fn configure(&mut self, s: &CollectionSettings) {
        if !s.enabled || !s.network {
            self.network = None;
        }
        if !s.enabled || !s.disk {
            self.disk = None;
        }
        if !s.enabled || !(s.audio || s.media) {
            self.apartment = None;
        }
    }
    fn apartment(&mut self) -> Result<(), String> {
        if self.apartment.is_none() {
            unsafe {
                RoInitialize(RO_INIT_MULTITHREADED).map_err(|e| e.to_string())?;
            }
            self.apartment = Some(Apartment);
        }
        Ok(())
    }
    pub fn network(&mut self) -> Result<Option<(f64, f64)>, String> {
        let current = unsafe {
            let mut table = std::ptr::null_mut();
            let error = GetIfTable2(&mut table);
            if error != 0 {
                self.network = None;
                return Err(format!("GetIfTable2: {error}"));
            }
            let rows =
                std::slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize);
            // Physical interfaces only: exclude loopback and virtual/VPN duplication.
            let counters = rows
                .iter()
                .filter(|r| r.OperStatus == 1 && r.InterfaceAndOperStatusFlags._bitfield & 1 != 0)
                .map(|r| (r.InterfaceIndex, (r.InOctets, r.OutOctets)))
                .collect::<BTreeMap<_, _>>();
            FreeMibTable(table.cast());
            counters
        };
        let now = Instant::now();
        let previous = self.network.replace((now, current.clone()));
        Ok(previous.and_then(|(time, old)| rates(time.elapsed().as_secs_f64(), &old, &current)))
    }
    pub fn disk(&mut self) -> Result<Option<(f64, f64)>, String> {
        if self.disk.is_none() {
            self.disk = Some(Disk::new()?);
        }
        let result = self.disk.as_mut().unwrap().read();
        if result.is_err() {
            self.disk = None;
        }
        result
    }
    pub fn audio(&mut self) -> Result<f64, String> {
        self.apartment()?;
        unsafe {
            let devices: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| e.to_string())?;
            let endpoint = devices
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .map_err(|e| e.to_string())?;
            let meter: IAudioMeterInformation = endpoint
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| e.to_string())?;
            meter
                .GetPeakValue()
                .map(|v| v as f64 * 100.0)
                .map_err(|e| e.to_string())
        }
    }
    pub fn media(&mut self) -> Result<Option<MediaObservation>, String> {
        self.apartment()?;
        let request = MediaManager::RequestAsync().map_err(|e| e.to_string())?;
        let deadline = Instant::now() + std::time::Duration::from_secs(1);
        while request.Status().map_err(|e| e.to_string())?.0 == 0 {
            if Instant::now() >= deadline {
                let _ = request.Cancel();
                return Err("Media query timed out".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let manager = request.GetResults().map_err(|e| e.to_string())?;
        let session = match manager.GetCurrentSession() {
            Ok(session) => session,
            Err(e) if e.code().0 == 0x80004003u32 as i32 => return Ok(None),
            Err(e) => return Err(e.to_string()),
        };
        let request = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| e.to_string())?;
        let deadline = Instant::now() + std::time::Duration::from_secs(1);
        while request.Status().map_err(|e| e.to_string())?.0 == 0 {
            if Instant::now() >= deadline {
                let _ = request.Cancel();
                return Err("Media metadata timed out".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let properties = request.GetResults().map_err(|e| e.to_string())?;
        let status = session
            .GetPlaybackInfo()
            .and_then(|p| p.PlaybackStatus())
            .map_err(|e| e.to_string())?;
        Ok(Some(MediaObservation {
            title: properties.Title().map_err(|e| e.to_string())?.to_string(),
            artist: properties.Artist().map_err(|e| e.to_string())?.to_string(),
            application: session
                .SourceAppUserModelId()
                .map_err(|e| e.to_string())?
                .to_string(),
            playback_status: match status {
                PlaybackStatus::Playing => "Playing",
                PlaybackStatus::Paused => "Paused",
                PlaybackStatus::Stopped => "Stopped",
                PlaybackStatus::Closed => "Closed",
                PlaybackStatus::Opened => "Opened",
                PlaybackStatus::Changing => "Changing",
                _ => "Unknown",
            }
            .into(),
        }))
    }
}

fn rates(
    seconds: f64,
    old: &BTreeMap<u32, (u64, u64)>,
    new: &BTreeMap<u32, (u64, u64)>,
) -> Option<(f64, f64)> {
    if seconds <= 0.0 || seconds > 6.0 || old.keys().ne(new.keys()) {
        return None;
    }
    let mut rx = 0u64;
    let mut tx = 0u64;
    for (id, (a, b)) in new {
        let (x, y) = old.get(id)?;
        rx = rx.checked_add(a.checked_sub(*x)?)?;
        tx = tx.checked_add(b.checked_sub(*y)?)?;
    }
    Some((rx as f64 / seconds, tx as f64 / seconds))
}
struct Disk {
    query: PDH_HQUERY,
    counters: [PDH_HCOUNTER; 2],
    warmed: bool,
}
impl Drop for Disk {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.query);
        }
    }
}
fn pdh(code: u32) -> Result<(), String> {
    if code == 0 {
        Ok(())
    } else {
        Err(format!("PDH: 0x{code:08x}"))
    }
}
impl Disk {
    fn new() -> Result<Self, String> {
        unsafe {
            let mut query = std::ptr::null_mut();
            pdh(PdhOpenQueryW(std::ptr::null(), 0, &mut query))?;
            let mut disk = Self {
                query,
                counters: [std::ptr::null_mut(); 2],
                warmed: false,
            };
            for (i, name) in [
                r"\PhysicalDisk(_Total)\Disk Read Bytes/sec",
                r"\PhysicalDisk(_Total)\Disk Write Bytes/sec",
            ]
            .iter()
            .enumerate()
            {
                let path: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
                pdh(PdhAddEnglishCounterW(
                    query,
                    path.as_ptr(),
                    0,
                    &mut disk.counters[i],
                ))?;
            }
            Ok(disk)
        }
    }
    fn read(&mut self) -> Result<Option<(f64, f64)>, String> {
        unsafe {
            pdh(PdhCollectQueryData(self.query))?;
            if !self.warmed {
                self.warmed = true;
                return Ok(None);
            }
            let mut values = [0.0; 2];
            for (i, counter) in self.counters.iter().enumerate() {
                let mut value: PDH_FMT_COUNTERVALUE = std::mem::zeroed();
                pdh(PdhGetFormattedCounterValue(
                    *counter,
                    PDH_FMT_DOUBLE,
                    std::ptr::null_mut(),
                    &mut value,
                ))?;
                if value.CStatus > 1 {
                    return Err(format!("Counter status: {}", value.CStatus));
                }
                let number = value.Anonymous.doubleValue;
                if !number.is_finite() || number < 0.0 {
                    return Err("Invalid disk counter".into());
                }
                values[i] = number;
            }
            Ok(Some((values[0], values[1])))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_network_disk_audio_and_media_read_only_smoke() {
        // Apartment and handles remain on this dedicated test thread.
        std::thread::spawn(|| {
            let mut reader = Reader::default();
            assert!(reader.network().unwrap().is_none());
            assert!(reader.disk().unwrap().is_none());
            std::thread::sleep(std::time::Duration::from_millis(1100));
            let network = reader.network().unwrap().unwrap();
            let disk = reader.disk().unwrap().unwrap();
            assert!(network.0 >= 0.0 && network.1 >= 0.0);
            assert!(disk.0 >= 0.0 && disk.1 >= 0.0);
            match reader.audio() {
                Ok(v) => assert!((0.0..=100.0).contains(&v)),
                Err(e) => eprintln!("Audio unavailable on this host: {e}"),
            }
            match reader.media() {
                Ok(_) => {}
                Err(e) => eprintln!("Media unavailable on this host: {e}"),
            }
            reader.configure(&CollectionSettings::default());
            assert!(
                reader.network.is_none() && reader.disk.is_none() && reader.apartment.is_none()
            );
        })
        .join()
        .unwrap();
    }
    #[test]
    fn network_rates_rebaseline_on_topology_reset_or_gap() {
        let old = BTreeMap::from([(1, (100, 200))]);
        let new = BTreeMap::from([(1, (140, 260))]);
        assert_eq!(rates(2.0, &old, &new), Some((20.0, 30.0)));
        assert_eq!(rates(2.0, &new, &old), None);
        assert_eq!(rates(8.0, &old, &new), None);
        assert_eq!(rates(2.0, &old, &BTreeMap::new()), None);
        assert_eq!(rates(2.0, &new, &new), Some((0.0, 0.0)));
    }
}
