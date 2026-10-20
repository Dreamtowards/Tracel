use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::{path::Path, time::Duration};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryDay {
    pub start_ms: u64,
    pub end_ms: u64,
    pub active_ms: u64,
    pub foreground_ms: u64,
    pub sample_count: u64,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryOverview {
    pub days: Vec<HistoryDay>,
    pub cpu: Vec<HistoryCpuBucket>,
    pub first_at_ms: Option<u64>,
    pub last_at_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCpuBucket {
    pub start_ms: u64,
    pub end_ms: u64,
    pub value: f64,
}

#[derive(Default)]
struct CpuRun {
    start: u64,
    end: u64,
    weighted: f64,
    covered: u64,
}

// Retain the longest observed run in a display bin; never join across missing data.
#[derive(Default)]
struct CpuBin {
    run: CpuRun,
    best: CpuRun,
}
impl CpuBin {
    fn finish(&mut self) {
        let run = std::mem::take(&mut self.run);
        if run.covered > self.best.covered {
            self.best = run;
        }
    }
    fn add(&mut self, start: u64, end: u64, value: f64) {
        if self.run.end != start {
            self.finish();
        }
        if self.run.covered == 0 {
            self.run.start = start;
        }
        self.run.end = end;
        self.run.weighted += value * (end - start) as f64;
        self.run.covered += end - start;
    }
}

fn cpu_preview(db: &Connection, start: u64, end: u64) -> Result<Vec<HistoryCpuBucket>, String> {
    const BIN_COUNT: u64 = 320;
    let step = (end - start).div_ceil(BIN_COUNT).max(1);
    let mut bins: Vec<CpuBin> = (0..BIN_COUNT).map(|_| CpuBin::default()).collect();
    // CPU measures the preceding confirmed interval, bounded to six seconds like Timeline.
    let mut statement = db.prepare("SELECT captured_at_ms,interval_start_ms,cpu_percent FROM system_samples WHERE captured_at_ms>?1 AND captured_at_ms<?2 AND cpu_percent IS NOT NULL ORDER BY captured_at_ms,id").map_err(|e| e.to_string())?;
    let mut rows = statement
        .query(params![
            start as i64,
            end.saturating_add(6000).min(i64::MAX as u64) as i64
        ])
        .map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let captured = row.get::<_, i64>(0).map_err(|e| e.to_string())?.max(0) as u64;
        let interval = row
            .get::<_, Option<i64>>(1)
            .map_err(|e| e.to_string())?
            .filter(|s| *s >= 0)
            .map(|s| s as u64);
        let value: f64 = row.get(2).map_err(|e| e.to_string())?;
        let Some(interval) = interval.filter(|s| *s < captured && captured - *s <= 6000) else {
            continue;
        };
        if !value.is_finite() {
            continue;
        }
        let mut left = interval.max(start);
        let right = captured.min(end);
        while left < right {
            let index = ((left - start) / step) as usize;
            let boundary = (start + (index as u64 + 1) * step).min(right);
            bins[index].add(left, boundary, value.clamp(0.0, 100.0));
            left = boundary;
        }
    }
    Ok(bins
        .into_iter()
        .filter_map(|mut bin| {
            bin.finish();
            (bin.best.covered > 0).then(|| HistoryCpuBucket {
                start_ms: bin.best.start,
                end_ms: bin.best.end,
                value: bin.best.weighted / bin.best.covered as f64,
            })
        })
        .collect())
}

pub fn overview(path: &Path, days: &[(u64, u64)]) -> Result<HistoryOverview, String> {
    if days.is_empty()
        || days.len() > 31
        || days.iter().any(|(s, e)| s >= e || *e > i64::MAX as u64)
        || days.windows(2).any(|pair| pair[0].1 > pair[1].0)
    {
        return Err("Overview requires up to 31 ordered time ranges".into());
    }
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;
    db.busy_timeout(Duration::from_secs(2))
        .map_err(|e| e.to_string())?;
    let db = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let (first_at_ms, last_at_ms) = db
        .query_row(
            "SELECT (SELECT MIN(captured_at_ms) FROM system_samples),(SELECT MAX(captured_at_ms) FROM system_samples)",
            [],
            |r| Ok((r.get::<_, Option<i64>>(0)?, r.get::<_, Option<i64>>(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for &(start, end) in days {
        let foreground: i64 = db.query_row("SELECT COALESCE(SUM(MIN(end_ms,?2)-MAX(start_ms,?1)),0) FROM foreground_intervals WHERE start_ms<?2 AND end_ms>?1",params![start as i64,end as i64],|r|r.get(0)).map_err(|e|e.to_string())?;
        let idle: i64 = db.query_row("SELECT COALESCE(SUM(MAX(0,MIN(f.end_ms,i.end_ms,?2)-MAX(f.start_ms,i.start_ms,?1))),0) FROM foreground_intervals f JOIN idle_intervals i ON i.start_ms<f.end_ms AND i.end_ms>f.start_ms WHERE f.start_ms<?2 AND f.end_ms>?1 AND i.start_ms<?2 AND i.end_ms>?1",params![start as i64,end as i64],|r|r.get(0)).map_err(|e|e.to_string())?;
        let sample_count: i64 = db.query_row("SELECT COUNT(*) FROM system_samples WHERE captured_at_ms>=?1 AND captured_at_ms<?2",params![start as i64,end as i64],|r|r.get(0)).map_err(|e|e.to_string())?;
        result.push(HistoryDay {
            start_ms: start,
            end_ms: end,
            foreground_ms: foreground.max(0) as u64,
            active_ms: (foreground - idle).max(0) as u64,
            sample_count: sample_count as u64,
        });
    }
    Ok(HistoryOverview {
        cpu: cpu_preview(&db, days[0].0, days.last().unwrap().1)?,
        days: result,
        first_at_ms: first_at_ms.map(|n| n as u64),
        last_at_ms: last_at_ms.map(|n| n as u64),
    })
}
