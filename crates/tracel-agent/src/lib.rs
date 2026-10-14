//! Selective system sampling, reusable by the desktop host and future agent process.
use serde::{Deserialize, Serialize};

#[cfg(windows)]
mod windows;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CollectionSettings {
    pub enabled: bool,
    pub cpu: bool,
    pub ram: bool,
}

impl CollectionSettings {
    pub fn initial() -> Self {
        Self {
            enabled: false,
            cpu: true,
            ram: true,
        }
    }
    pub fn collecting(&self) -> bool {
        self.enabled && (self.cpu || self.ram)
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

pub trait SystemReader {
    fn cpu_times(&mut self) -> Result<CpuTimes, String>;
    fn memory(&mut self) -> Result<(u64, u64), String>;
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemObservation {
    pub captured_at_ms: u64,
    pub cpu_percent: Option<f64>,
    pub memory_used_bytes: Option<u64>,
    pub memory_total_bytes: Option<u64>,
    pub errors: Vec<String>,
}

#[derive(Default)]
pub struct Sampler {
    previous_cpu: Option<CpuTimes>,
}

impl Sampler {
    pub fn reset(&mut self) {
        self.previous_cpu = None;
    }
    pub fn sample(
        &mut self,
        settings: &CollectionSettings,
        reader: &mut impl SystemReader,
        captured_at_ms: u64,
    ) -> SystemObservation {
        let mut sample = SystemObservation {
            captured_at_ms,
            cpu_percent: None,
            memory_used_bytes: None,
            memory_total_bytes: None,
            errors: vec![],
        };
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
        sample
    }
}

pub struct NativeReader;
#[cfg(windows)]
impl SystemReader for NativeReader {
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
    #[cfg(windows)]
    fn native_system_metrics_are_available() {
        let mut reader = NativeReader;
        assert!(reader.cpu_times().is_ok());
        let (used, total) = reader.memory().unwrap();
        assert!(total > 0 && used <= total);
    }
}
