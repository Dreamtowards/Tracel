//! Read-only Windows telemetry. Uses system DLLs, no vendor runtime or sensor driver.
use std::collections::BTreeMap;
use tracel_core::{BatteryObservation, GpuEngineObservation, GpuObservation};
use windows_sys::Win32::System::{
    Performance::*,
    Power::*,
    Threading::{GetActiveProcessorCount, ALL_PROCESSOR_GROUPS},
};

pub fn battery() -> Result<BatteryObservation, String> {
    let mut status = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut status) } == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    Ok(battery_status(status))
}
fn battery_status(s: SYSTEM_POWER_STATUS) -> BatteryObservation {
    let present = (s.BatteryFlag != 255).then_some(s.BatteryFlag & 128 == 0);
    BatteryObservation {
        present,
        percent: (present == Some(true) && s.BatteryLifePercent <= 100)
            .then_some(s.BatteryLifePercent),
        plugged_in: match s.ACLineStatus {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        },
        charging: (present == Some(true)).then_some(s.BatteryFlag & 8 != 0),
    }
}
pub fn cpu_frequency() -> Result<f64, String> {
    // ProcessorInformation reports one entry per logical processor. Limit allocations.
    let count = unsafe { GetActiveProcessorCount(ALL_PROCESSOR_GROUPS) } as usize;
    if count == 0 || count > 4096 {
        return Err("Invalid logical processor count".into());
    }
    let mut entries = vec![PROCESSOR_POWER_INFORMATION::default(); count];
    let status = unsafe {
        CallNtPowerInformation(
            ProcessorInformation,
            std::ptr::null(),
            0,
            entries.as_mut_ptr().cast(),
            std::mem::size_of_val(entries.as_slice()) as u32,
        )
    };
    if status != 0 {
        return Err(format!("ProcessorInformation: 0x{status:08x}"));
    }
    if entries.iter().any(|p| p.CurrentMhz == 0) {
        return Err("Windows did not report current CPU frequency".into());
    }
    Ok(entries.iter().map(|p| p.CurrentMhz as f64).sum::<f64>() / count as f64)
}

pub struct GpuReader {
    query: PDH_HQUERY,
    counters: [PDH_HCOUNTER; 3],
    names: BTreeMap<String, String>,
    warmed: bool,
}
impl Drop for GpuReader {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.query);
        }
    }
}
fn check(code: u32) -> Result<(), String> {
    if code == 0 {
        Ok(())
    } else {
        Err(format!("GPU PDH: 0x{code:08x}"))
    }
}
impl GpuReader {
    pub fn new() -> Result<Self, String> {
        let mut query = std::ptr::null_mut();
        unsafe {
            check(PdhOpenQueryW(std::ptr::null(), 0, &mut query))?;
        }
        let mut reader = Self {
            query,
            counters: [std::ptr::null_mut(); 3],
            names: adapter_names(),
            warmed: false,
        };
        for (i, path) in [
            r"\GPU Engine(*)\Utilization Percentage",
            r"\GPU Adapter Memory(*)\Dedicated Usage",
            r"\GPU Adapter Memory(*)\Shared Usage",
        ]
        .iter()
        .enumerate()
        {
            let path: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
            unsafe {
                check(PdhAddEnglishCounterW(
                    query,
                    path.as_ptr(),
                    0,
                    &mut reader.counters[i],
                ))?;
            }
        }
        Ok(reader)
    }
    pub fn read(&mut self) -> Result<Option<Vec<GpuObservation>>, String> {
        unsafe {
            check(PdhCollectQueryData(self.query))?;
        }
        if !self.warmed {
            self.warmed = true;
            return Ok(None);
        }
        let engine = counter_array(self.counters[0])?;
        let dedicated = counter_array(self.counters[1])?;
        let shared = counter_array(self.counters[2])?;
        let mut devices = aggregate_engines(&engine)?;
        for (values, is_dedicated) in [(&dedicated, true), (&shared, false)] {
            for (instance, value) in values {
                let Some(id) = adapter_id(instance) else {
                    return Err(format!("Unknown GPU memory instance: {instance}"));
                };
                let gpu = devices.entry(id.clone()).or_insert_with(|| GpuObservation {
                    id,
                    ..Default::default()
                });
                // Adapter-memory counters already aggregate processes. Never sum process VRAM.
                if is_dedicated {
                    gpu.dedicated_used_bytes = Some(*value as u64);
                } else {
                    gpu.shared_used_bytes = Some(*value as u64);
                }
            }
        }
        if devices.is_empty() {
            return Err("No GPU performance counter instances available".into());
        }
        if devices.len() > 32 {
            return Err("GPU adapter limit exceeded".into());
        }
        for (index, gpu) in devices.values_mut().enumerate() {
            let luid = gpu.id.split("_phys_").next().unwrap_or(&gpu.id);
            gpu.name = self
                .names
                .get(&luid.to_ascii_lowercase())
                .cloned()
                .unwrap_or_else(|| format!("GPU {}", index + 1));
            if gpu.engines.len() > 128 {
                return Err("GPU engine limit exceeded".into());
            }
        }
        Ok(Some(devices.into_values().collect()))
    }
}

fn adapter_names() -> BTreeMap<String, String> {
    use ::windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1};
    let mut names = BTreeMap::new();
    unsafe {
        if let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() {
            for index in 0..32 {
                let Ok(adapter) = factory.EnumAdapters1(index) else {
                    break;
                };
                if let Ok(desc) = adapter.GetDesc1() {
                    let length = desc
                        .Description
                        .iter()
                        .position(|v| *v == 0)
                        .unwrap_or(desc.Description.len());
                    names.insert(
                        format!(
                            "luid_0x{:08x}_0x{:08x}",
                            desc.AdapterLuid.HighPart as u32, desc.AdapterLuid.LowPart
                        ),
                        String::from_utf16_lossy(&desc.Description[..length]),
                    );
                }
            }
        }
    }
    names
}

fn counter_array(counter: PDH_HCOUNTER) -> Result<Vec<(String, f64)>, String> {
    // u64 storage guarantees alignment for the PDH item structures and embedded strings.
    // Instance sets may grow between the sizing and read calls; retry with a bounded buffer.
    for _ in 0..3 {
        let mut bytes = 0;
        let mut count = 0;
        let status = unsafe {
            PdhGetFormattedCounterArrayW(
                counter,
                PDH_FMT_DOUBLE | 0x800, /* PDH_FMT_NOCAP100 */
                &mut bytes,
                &mut count,
                std::ptr::null_mut(),
            )
        };
        if status != PDH_MORE_DATA {
            check(status)?;
            if bytes == 0 {
                return Ok(vec![]);
            }
        }
        if bytes == 0 || bytes > 16 * 1024 * 1024 {
            return Err("GPU counter buffer limit exceeded".into());
        }
        let mut buffer = vec![0u64; (bytes as usize).div_ceil(8)];
        let allocated = buffer.len() * 8;
        let status = unsafe {
            PdhGetFormattedCounterArrayW(
                counter,
                PDH_FMT_DOUBLE | 0x800, /* PDH_FMT_NOCAP100 */
                &mut bytes,
                &mut count,
                buffer.as_mut_ptr().cast(),
            )
        };
        if status == PDH_MORE_DATA {
            continue;
        }
        check(status)?;
        if count as usize * std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>() > allocated {
            return Err("Invalid GPU item count".into());
        }
        let items = unsafe {
            std::slice::from_raw_parts(
                buffer.as_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>(),
                count as usize,
            )
        };
        let mut values = Vec::new();
        for item in items {
            // A process can disappear between reads. Missing instances contribute no observation.
            if item.FmtValue.CStatus == PDH_CSTATUS_NO_INSTANCE {
                continue;
            }
            if item.FmtValue.CStatus > 1 {
                return Err(format!(
                    "GPU counter status: 0x{:08x}",
                    item.FmtValue.CStatus
                ));
            }
            let value = unsafe { item.FmtValue.Anonymous.doubleValue };
            if !value.is_finite() || value < 0.0 {
                return Err("Invalid GPU counter value".into());
            }
            let ptr = item.szName;
            let start = ptr as usize;
            let low = buffer.as_ptr() as usize;
            let high = low + allocated;
            if start < low || start >= high || start % 2 != 0 {
                return Err("Invalid GPU instance pointer".into());
            }
            let text = unsafe { std::slice::from_raw_parts(ptr, (high - start) / 2) };
            let end = text
                .iter()
                .position(|v| *v == 0)
                .ok_or("Unterminated GPU instance")?;
            values.push((String::from_utf16_lossy(&text[..end]), value));
        }
        return Ok(values);
    }
    Err("GPU instances changed repeatedly during read".into())
}
fn adapter_id(instance: &str) -> Option<String> {
    let suffix = instance.get(instance.find("luid_")?..)?;
    let (luid, physical) = suffix.split_once("_phys_")?;
    let physical = physical.split('_').next()?;
    physical.parse::<u32>().ok()?;
    Some(format!("{luid}_phys_{physical}").to_ascii_lowercase())
}
fn aggregate_engines(values: &[(String, f64)]) -> Result<BTreeMap<String, GpuObservation>, String> {
    let mut sums: BTreeMap<(String, String, String), f64> = BTreeMap::new();
    for (instance, value) in values {
        let adapter = adapter_id(instance)
            .ok_or_else(|| format!("Unknown GPU engine instance: {instance}"))?;
        let (_, suffix) = instance
            .split_once("_eng_")
            .ok_or("Missing GPU engine index")?;
        let (index, kind) = suffix
            .split_once("_engtype_")
            .ok_or("Missing GPU engine type")?;
        index
            .parse::<u32>()
            .map_err(|_| "Invalid GPU engine index")?;
        *sums
            .entry((adapter, index.into(), kind.into()))
            .or_default() += value;
    }
    let mut devices = BTreeMap::new();
    for ((id, engine, kind), value) in sums {
        let gpu = devices.entry(id.clone()).or_insert_with(|| GpuObservation {
            id,
            ..Default::default()
        });
        let value = value.clamp(0.0, 100.0);
        gpu.utilization_percent = Some(gpu.utilization_percent.unwrap_or(0.0).max(value));
        gpu.engines.push(GpuEngineObservation {
            id: engine.clone(),
            name: format!("{kind} #{engine}"),
            utilization_percent: value,
        });
    }
    Ok(devices)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adapter_identity_normalizes_pdh_hex_casing_for_dxgi_lookup() {
        let upper =
            adapter_id("pid_123_luid_0x00000000_0x0000F455_phys_0_eng_1_engtype_3D").unwrap();
        let lower = adapter_id("luid_0x00000000_0x0000f455_phys_0").unwrap();
        assert_eq!(upper, lower);
        let names = BTreeMap::from([(
            "luid_0x00000000_0x0000f455".to_string(),
            "GPU model".to_string(),
        )]);
        assert_eq!(
            names.get(upper.split("_phys_").next().unwrap()).unwrap(),
            "GPU model"
        );
        assert_ne!(
            adapter_id("luid_0x00000000_0x0000F455_phys_1").unwrap(),
            lower
        );
    }
    #[test]
    fn engine_aggregation_keeps_adapters_and_physical_engines_separate() {
        let entry = |pid, low, engine, value| {
            (
                format!(
                    "pid_{pid}_luid_0x00000000_0x{low:08x}_phys_0_eng_{engine}_engtype_Compute"
                ),
                value,
            )
        };
        let devices = aggregate_engines(&[
            entry(1, 1, 0, 35.0),
            entry(2, 1, 0, 45.0),
            entry(1, 1, 1, 60.0),
            entry(1, 2, 0, 0.0),
        ])
        .unwrap();
        let a = &devices["luid_0x00000000_0x00000001_phys_0"];
        assert_eq!(a.utilization_percent, Some(80.0));
        assert_eq!(a.engines.len(), 2);
        assert_eq!(
            devices["luid_0x00000000_0x00000002_phys_0"].utilization_percent,
            Some(0.0)
        );
        assert!(aggregate_engines(&[("unexpected".into(), 1.0)]).is_err());
    }
    #[test]
    fn battery_unknown_absent_and_full_on_ac_are_distinct() {
        let absent = battery_status(SYSTEM_POWER_STATUS {
            ACLineStatus: 1,
            BatteryFlag: 128,
            BatteryLifePercent: 255,
            ..Default::default()
        });
        assert_eq!(absent.present, Some(false));
        assert_eq!(absent.percent, None);
        assert_eq!(absent.charging, None);
        let full = battery_status(SYSTEM_POWER_STATUS {
            ACLineStatus: 1,
            BatteryFlag: 1,
            BatteryLifePercent: 100,
            ..Default::default()
        });
        assert_eq!(full.percent, Some(100));
        assert_eq!(full.plugged_in, Some(true));
        assert_eq!(full.charging, Some(false));
        let unknown = battery_status(SYSTEM_POWER_STATUS {
            ACLineStatus: 255,
            BatteryFlag: 255,
            BatteryLifePercent: 255,
            ..Default::default()
        });
        assert_eq!(unknown, BatteryObservation::default());
    }
    #[test]
    fn native_hardware_read_only_smoke() {
        assert!(battery().is_ok());
        match cpu_frequency() {
            Ok(v) => assert!(v > 0.0),
            Err(e) => eprintln!("CPU frequency unavailable: {e}"),
        }
        match GpuReader::new() {
            Ok(mut reader) => {
                assert!(reader.read().unwrap().is_none());
                std::thread::sleep(std::time::Duration::from_millis(1100));
                let readings = reader.read().expect("GPU arrays on this host").unwrap();
                assert!(!readings.is_empty());
                for gpu in readings {
                    assert!(!gpu.name.is_empty());
                    assert!(gpu.dedicated_used_bytes.is_some());
                }
            }
            Err(e) => eprintln!("GPU counters unavailable: {e}"),
        }
    }
}
