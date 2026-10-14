//! Range math foundation; database queries and LOD transport are deferred.
use tracel_core::{Metric, MetricSample, Quality, Subject, TimeRange};

#[derive(Debug, PartialEq)]
pub struct GaugeSummary {
    pub mean: Option<f64>,
    pub covered_ms: u64,
}

/// Time-weighted gauge mean, clipped to the requested half-open range.
/// Input must contain non-overlapping sample intervals per subject/metric.
/// Returns None for byte-counter metrics, which require totals, not gauge means.
pub fn summarize_gauge(
    samples: &[MetricSample],
    range: TimeRange,
    subject: &Subject,
    metric: Metric,
) -> Option<GaugeSummary> {
    if matches!(
        metric,
        Metric::NetworkReceiveBytes
            | Metric::NetworkSendBytes
            | Metric::DiskReadBytes
            | Metric::DiskWriteBytes
    ) {
        return None;
    }
    let mut covered_ms = 0u64;
    let mut weighted = 0.0;
    for sample in samples {
        if &sample.subject != subject
            || sample.metric != metric
            || sample.quality == Quality::Missing
        {
            continue;
        }
        if let (Some(value), Some(clipped)) = (
            sample.value.filter(|v| v.is_finite()),
            sample.range.intersection(range),
        ) {
            let width = (clipped.end_ms - clipped.start_ms) as u64;
            weighted += value * width as f64;
            covered_ms += width;
        }
    }
    Some(GaugeSummary {
        mean: (covered_ms > 0).then(|| weighted / covered_ms as f64),
        covered_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clips_weights_preserves_zero_and_excludes_gaps_and_other_subjects() {
        let sample = |start, end, value, subject| MetricSample {
            range: TimeRange::new(start, end).unwrap(),
            subject,
            metric: Metric::CpuPercent,
            value,
            source: "test".into(),
            quality: Quality::Observed,
        };
        let samples = vec![
            sample(0, 1000, Some(0.0), Subject::System),
            sample(1000, 3000, Some(100.0), Subject::System),
            sample(3000, 4000, None, Subject::System),
            sample(0, 4000, Some(90.0), Subject::Process("instance-1".into())),
        ];
        let result = summarize_gauge(
            &samples,
            TimeRange::new(500, 4000).unwrap(),
            &Subject::System,
            Metric::CpuPercent,
        )
        .unwrap();
        assert_eq!(
            result,
            GaugeSummary {
                mean: Some(80.0),
                covered_ms: 2500
            }
        );
        assert_eq!(
            summarize_gauge(
                &samples,
                TimeRange::new(3000, 4000).unwrap(),
                &Subject::System,
                Metric::CpuPercent
            )
            .unwrap()
            .mean,
            None
        );
        assert_eq!(
            summarize_gauge(
                &samples,
                TimeRange::new(0, 4000).unwrap(),
                &Subject::System,
                Metric::DiskReadBytes
            ),
            None
        );
    }
}
