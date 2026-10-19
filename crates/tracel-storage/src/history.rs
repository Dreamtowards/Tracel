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
    pub first_at_ms: Option<u64>,
    pub last_at_ms: Option<u64>,
}

pub fn overview(path: &Path, days: &[(u64, u64)]) -> Result<HistoryOverview, String> {
    if days.is_empty()
        || days.len() > 31
        || days
            .iter()
            .any(|(s, e)| s >= e || e - s > 25 * 3600 * 1000 || *e > i64::MAX as u64)
        || days.windows(2).any(|pair| pair[0].1 > pair[1].0)
    {
        return Err("Overview requires up to 31 ordered calendar days".into());
    }
    let db = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;
    db.busy_timeout(Duration::from_secs(2))
        .map_err(|e| e.to_string())?;
    let db = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let (first_at_ms, last_at_ms) = db
        .query_row(
            "SELECT MIN(captured_at_ms),MAX(captured_at_ms) FROM system_samples",
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
        days: result,
        first_at_ms: first_at_ms.map(|n| n as u64),
        last_at_ms: last_at_ms.map(|n| n as u64),
    })
}
