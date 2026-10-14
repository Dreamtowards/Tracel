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
