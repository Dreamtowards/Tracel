//! Selective system sampling, reusable by the desktop host and future agent process.
use serde::{Deserialize, Serialize};

#[cfg(windows)]
mod extended;
#[cfg(windows)]
mod windows;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CollectionSettings {
    pub enabled: bool,
    pub cpu: bool,
    pub ram: bool,
    pub network: bool,
    pub disk: bool,
    pub audio: bool,
    pub media: bool,
}

impl CollectionSettings {
    pub fn initial() -> Self {
        Self {
            enabled: false,
            cpu: true,
            ram: true,
            ..Self::default()
        }
    }
    pub fn collecting(&self) -> bool {
        self.enabled
            && (self.cpu || self.ram || self.network || self.disk || self.audio || self.media)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct CpuTimes {
    pub idle: u64,
    pub kernel: u64,
    pub user: u64,
}

pub fn cpu_percent(previous: CpuTimes, current: CpuTimes) -> Option<f64> {
    let total = current
        .kernel
        .checked_sub(previous.kernel)?
        .checked_add(current.user.checked_sub(previous.user)?)?;
    let idle = current.idle.checked_sub(previous.idle)?;
    if total == 0 || idle > total {
        return None;
    }
    Some(100.0 * (total - idle) as f64 / total as f64)
}

pub use tracel_core::{MediaObservation, SystemObservation};

pub trait SystemReader {
    fn configure(&mut self, _settings: &CollectionSettings) {}
    fn reset(&mut self) {}
    fn network(&mut self) -> Result<Option<(f64, f64)>, String> {
        Err("Unavailable".into())
    }
    fn disk(&mut self) -> Result<Option<(f64, f64)>, String> {
        Err("Unavailable".into())
    }
    fn audio(&mut self) -> Result<f64, String> {
        Err("Unavailable".into())
    }
    fn media(&mut self) -> Result<Option<MediaObservation>, String> {
        Err("Unavailable".into())
    }
    fn cpu_times(&mut self) -> Result<CpuTimes, String>;
    fn memory(&mut self) -> Result<(u64, u64), String>;
}

#[derive(Default)]
pub struct Sampler {
    previous_cpu: Option<CpuTimes>,
    previous_observation_ms: Option<u64>,
}

impl Sampler {
    pub fn reset(&mut self) {
        self.previous_cpu = None;
        self.previous_observation_ms = None;
    }
    pub fn sample(
        &mut self,
        settings: &CollectionSettings,
        reader: &mut impl SystemReader,
        captured_at_ms: u64,
    ) -> SystemObservation {
        let mut sample = SystemObservation {
            captured_at_ms,
            interval_start_ms: self.previous_observation_ms.filter(|previous| {
                captured_at_ms
                    .checked_sub(*previous)
                    .is_some_and(|delta| delta > 0 && delta <= 6000)
            }),
            cpu_percent: None,
            memory_used_bytes: None,
            memory_total_bytes: None,
            network_receive_bytes_per_second: None,
            network_send_bytes_per_second: None,
            disk_read_bytes_per_second: None,
            disk_write_bytes_per_second: None,
            audio_peak_percent: None,
            media: None,
            errors: vec![],
        };
        self.previous_observation_ms = settings.collecting().then_some(captured_at_ms);
        reader.configure(settings);
        if settings.enabled && settings.cpu {
            match reader.cpu_times() {
                Ok(current) => {
                    sample.cpu_percent = self
                        .previous_cpu
                        .and_then(|previous| cpu_percent(previous, current));
                    self.previous_cpu = Some(current);
                }
                Err(error) => {
                    self.previous_cpu = None;
                    sample.errors.push(format!("CPU: {error}"));
                }
            }
        } else {
            self.previous_cpu = None;
        }
        if settings.enabled && settings.ram {
            match reader.memory() {
                Ok((used, total)) => {
                    sample.memory_used_bytes = Some(used);
                    sample.memory_total_bytes = Some(total);
                }
                Err(error) => sample.errors.push(format!("RAM: {error}")),
            }
        }
        if settings.enabled && settings.network {
            match reader.network() {
                Ok(Some((rx, tx))) => {
                    sample.network_receive_bytes_per_second = Some(rx);
                    sample.network_send_bytes_per_second = Some(tx);
                }
                Ok(None) => {}
                Err(e) => sample.errors.push(format!("Network: {e}")),
            }
        }
        if settings.enabled && settings.disk {
            match reader.disk() {
                Ok(Some((read, write))) => {
                    sample.disk_read_bytes_per_second = Some(read);
                    sample.disk_write_bytes_per_second = Some(write);
                }
                Ok(None) => {}
                Err(e) => sample.errors.push(format!("Disk: {e}")),
            }
        }
        if settings.enabled && settings.audio {
            match reader.audio() {
                Ok(value) => sample.audio_peak_percent = Some(value),
                Err(e) => sample.errors.push(format!("Audio: {e}")),
            }
        }
        if settings.enabled && settings.media {
            match reader.media() {
                Ok(value) => sample.media = value,
                Err(e) => sample.errors.push(format!("Media: {e}")),
            }
        }
        sample
    }
}

#[derive(Default)]
pub struct NativeReader {
    #[cfg(windows)]
    extended: extended::Reader,
}
#[cfg(windows)]
impl SystemReader for NativeReader {
    fn configure(&mut self, settings: &CollectionSettings) {
        self.extended.configure(settings);
    }
    fn reset(&mut self) {
        self.extended.reset();
    }
    fn network(&mut self) -> Result<Option<(f64, f64)>, String> {
        self.extended.network()
    }
    fn disk(&mut self) -> Result<Option<(f64, f64)>, String> {
        self.extended.disk()
    }
    fn audio(&mut self) -> Result<f64, String> {
        self.extended.audio()
    }
    fn media(&mut self) -> Result<Option<MediaObservation>, String> {
        self.extended.media()
    }
    fn cpu_times(&mut self) -> Result<CpuTimes, String> {
        windows::cpu_times()
    }
    fn memory(&mut self) -> Result<(u64, u64), String> {
        windows::memory()
    }
}
#[cfg(not(windows))]
impl SystemReader for NativeReader {
    fn cpu_times(&mut self) -> Result<CpuTimes, String> {
        Err("Windows only".into())
    }
    fn memory(&mut self) -> Result<(u64, u64), String> {
        Err("Windows only".into())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundInfo {
    pub captured_at_ms: u64,
    pub window_id: String,
    pub process_id: u32,
    pub title: String,
    pub executable: Option<String>,
    pub url: Option<String>,
    pub notes: Vec<String>,
}

pub fn foreground_info(captured_at_ms: u64) -> Result<ForegroundInfo, String> {
    #[cfg(windows)]
    {
        windows::foreground_info(captured_at_ms)
    }
    #[cfg(not(windows))]
    {
        let _ = captured_at_ms;
        Err("Windows only".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Default)]
    struct Reader {
        cpu_calls: u32,
        ram_calls: u32,
    }
    impl SystemReader for Reader {
        fn cpu_times(&mut self) -> Result<CpuTimes, String> {
            self.cpu_calls += 1;
            Ok(CpuTimes {
                idle: self.cpu_calls as u64 * 20,
                kernel: self.cpu_calls as u64 * 60,
                user: self.cpu_calls as u64 * 40,
            })
        }
        fn memory(&mut self) -> Result<(u64, u64), String> {
            self.ram_calls += 1;
            Ok((100, 200))
        }
    }
    #[test]
    fn disabled_collectors_never_query_the_os_and_cpu_restarts_with_a_baseline() {
        let mut reader = Reader::default();
        let mut sampler = Sampler::default();
        let mut settings = CollectionSettings::initial();
        sampler.sample(&settings, &mut reader, 0);
        assert_eq!((reader.cpu_calls, reader.ram_calls), (0, 0));
        settings.enabled = true;
        settings.ram = false;
        assert_eq!(sampler.sample(&settings, &mut reader, 1).cpu_percent, None);
        assert_eq!(
            sampler.sample(&settings, &mut reader, 2).cpu_percent,
            Some(80.0)
        );
        assert_eq!((reader.cpu_calls, reader.ram_calls), (2, 0));
        settings.cpu = false;
        settings.ram = true;
        let sample = sampler.sample(&settings, &mut reader, 3);
        assert_eq!(sample.cpu_percent, None);
        assert_eq!(sample.memory_used_bytes, Some(100));
        assert_eq!((reader.cpu_calls, reader.ram_calls), (2, 1));
        settings.cpu = true;
        assert_eq!(sampler.sample(&settings, &mut reader, 4).cpu_percent, None);
        settings.enabled = false;
        sampler.sample(&settings, &mut reader, 5);
        assert_eq!((reader.cpu_calls, reader.ram_calls), (3, 2));
    }
    #[test]
    fn cpu_handles_zero_reset_and_kernel_including_idle() {
        let a = CpuTimes {
            idle: 20,
            kernel: 60,
            user: 40,
        };
        assert_eq!(cpu_percent(a, a), None);
        assert_eq!(
            cpu_percent(
                a,
                CpuTimes {
                    idle: 70,
                    kernel: 110,
                    user: 40
                }
            ),
            Some(0.0)
        );
        assert_eq!(
            cpu_percent(
                a,
                CpuTimes {
                    idle: 0,
                    kernel: 0,
                    user: 0
                }
            ),
            None
        );
    }
    #[test]
    fn new_sources_are_independent_and_old_preferences_do_not_enable_them() {
        struct Sources([u32; 4]);
        impl SystemReader for Sources {
            fn cpu_times(&mut self) -> Result<CpuTimes, String> {
                panic!("CPU disabled")
            }
            fn memory(&mut self) -> Result<(u64, u64), String> {
                panic!("RAM disabled")
            }
            fn network(&mut self) -> Result<Option<(f64, f64)>, String> {
                self.0[0] += 1;
                Ok(Some((0.0, 10.0)))
            }
            fn disk(&mut self) -> Result<Option<(f64, f64)>, String> {
                self.0[1] += 1;
                Ok(None)
            }
            fn audio(&mut self) -> Result<f64, String> {
                self.0[2] += 1;
                Ok(0.0)
            }
            fn media(&mut self) -> Result<Option<MediaObservation>, String> {
                self.0[3] += 1;
                Ok(None)
            }
        }
        let old: CollectionSettings =
            serde_json::from_str(r#"{"enabled":true,"cpu":true,"ram":true}"#).unwrap();
        assert!(!old.network && !old.disk && !old.audio && !old.media);
        let mut sampler = Sampler::default();
        let mut reader = Sources([0; 4]);
        let mut settings = CollectionSettings {
            enabled: true,
            network: true,
            ..Default::default()
        };
        let value = sampler.sample(&settings, &mut reader, 1);
        assert_eq!(value.network_receive_bytes_per_second, Some(0.0));
        assert_eq!(reader.0, [1, 0, 0, 0]);
        settings.network = false;
        settings.disk = true;
        assert!(sampler
            .sample(&settings, &mut reader, 2)
            .disk_read_bytes_per_second
            .is_none());
        assert_eq!(reader.0, [1, 1, 0, 0]);
        settings.disk = false;
        settings.audio = true;
        assert_eq!(
            sampler.sample(&settings, &mut reader, 3).audio_peak_percent,
            Some(0.0)
        );
        assert_eq!(reader.0, [1, 1, 1, 0]);
        settings.audio = false;
        settings.media = true;
        assert!(sampler.sample(&settings, &mut reader, 4).media.is_none());
        assert_eq!(reader.0, [1, 1, 1, 1]);
        settings.enabled = false;
        sampler.sample(&settings, &mut reader, 5);
        assert_eq!(reader.0, [1, 1, 1, 1]);
    }
    #[test]
    #[cfg(windows)]
    fn native_system_metrics_are_available() {
        let mut reader = NativeReader::default();
        assert!(reader.cpu_times().is_ok());
        let (used, total) = reader.memory().unwrap();
        assert!(total > 0 && used <= total);
    }
}
