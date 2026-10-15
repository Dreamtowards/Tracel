//! OS-neutral native observations. All timestamps are UTC Unix milliseconds.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimeRange {
    pub start_ms: i64,
    pub end_ms: i64,
}

impl TimeRange {
    /// Half-open [start, end); rejects empty and reversed ranges.
    pub fn new(start_ms: i64, end_ms: i64) -> Option<Self> {
        (start_ms < end_ms).then_some(Self { start_ms, end_ms })
    }

    pub fn intersection(self, other: Self) -> Option<Self> {
        Self::new(
            self.start_ms.max(other.start_ms),
            self.end_ms.min(other.end_ms),
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Subject {
    System,
    Process(String),
    Application(String),
    Device(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Metric {
    CpuPercent,
    MemoryBytes,
    GpuPercent,
    NetworkReceiveBytes,
    NetworkSendBytes,
    DiskReadBytes,
    DiskWriteBytes,
    AudioLevelPercent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Quality {
    Observed,
    Missing,
    Estimated,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MetricSample {
    pub range: TimeRange,
    pub subject: Subject,
    pub metric: Metric,
    /// None means missing; Some(0.0) is an observed zero.
    /// Network/disk metrics hold bytes measured over range, not bytes/sec.
    pub value: Option<f64>,
    pub source: String,
    pub quality: Quality,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn half_open_ranges_do_not_overlap_at_boundary() {
        let a = TimeRange::new(0, 1000).unwrap();
        assert_eq!(a.intersection(TimeRange::new(1000, 2000).unwrap()), None);
        assert_eq!(
            a.intersection(TimeRange::new(500, 2000).unwrap()),
            TimeRange::new(500, 1000)
        );
        assert_eq!(TimeRange::new(1, 1), None);
        assert_eq!(TimeRange::new(2, 1), None);
    }
}

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaObservation {
    pub title: String,
    pub artist: String,
    pub application: String,
    pub playback_status: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemObservation {
    pub captured_at_ms: u64,
    /// Previous sampling cycle, absent after reset/disable/gap. Rates cover this interval.
    pub interval_start_ms: Option<u64>,
    pub cpu_percent: Option<f64>,
    /// Mean Windows-reported current MHz, not effective per-core clock telemetry.
    pub cpu_frequency_mhz: Option<f64>,
    pub gpus: Option<Vec<GpuObservation>>,
    pub battery: Option<BatteryObservation>,
    pub memory_used_bytes: Option<u64>,
    pub memory_total_bytes: Option<u64>,
    pub network_receive_bytes_per_second: Option<f64>,
    pub network_send_bytes_per_second: Option<f64>,
    pub disk_read_bytes_per_second: Option<f64>,
    pub disk_write_bytes_per_second: Option<f64>,
    pub audio_peak_percent: Option<f64>,
    pub audio_input_peak_percent: Option<f64>,
    pub media: Option<MediaObservation>,
    pub activity: Option<ActivityObservation>,
    pub errors: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuObservation {
    /// Windows adapter LUID + physical adapter index; do not merge different adapters.
    pub id: String,
    pub name: String,
    pub utilization_percent: Option<f64>,
    pub engines: Vec<GpuEngineObservation>,
    pub dedicated_used_bytes: Option<u64>,
    pub shared_used_bytes: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuEngineObservation {
    pub id: String,
    pub name: String,
    pub utilization_percent: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatteryObservation {
    pub present: Option<bool>,
    pub percent: Option<u8>,
    pub plugged_in: Option<bool>,
    pub charging: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessObservation {
    pub instance_id: String,
    pub process_id: u32,
    pub name: String,
    pub executable: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowObservation {
    pub process: ProcessObservation,
    pub window_id: String,
    pub title: String,
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityObservation {
    pub foreground: Option<WindowObservation>,
    pub background: Option<Vec<ProcessObservation>>,
    pub idle_ms: Option<u64>,
}
