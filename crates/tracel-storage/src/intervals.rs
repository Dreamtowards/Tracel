use rusqlite::{params, Connection, OptionalExtension};
use tracel_core::{ProcessObservation, SystemObservation};

pub const TABLES: &[&str] = &[
    "app_presence_intervals",
    "foreground_intervals",
    "window_title_intervals",
    "media_intervals",
    "idle_intervals",
];

fn text(db: &Connection, value: &str) -> rusqlite::Result<i64> {
    db.execute(
        "INSERT INTO strings(value) VALUES(?1) ON CONFLICT DO NOTHING",
        [value],
    )?;
    db.query_row("SELECT id FROM strings WHERE value=?1", [value], |r| {
        r.get(0)
    })
}
fn process(db: &Connection, p: &ProcessObservation) -> rusqlite::Result<i64> {
    let key = p
        .executable
        .as_ref()
        .map(|path| format!("exe:{}", path.to_lowercase()))
        .unwrap_or_else(|| format!("instance:{}", p.instance_id));
    db.execute(
        "INSERT INTO applications(identity_key,executable) VALUES(?1,?2) ON CONFLICT DO NOTHING",
        params![key, p.executable],
    )?;
    let app: i64 = db.query_row(
        "SELECT id FROM applications WHERE identity_key=?1",
        [&key],
        |r| r.get(0),
    )?;
    db.execute("INSERT INTO process_instances(application_id,instance_key,process_id,name) VALUES(?1,?2,?3,?4) ON CONFLICT DO NOTHING",params![app,p.instance_id,p.process_id,p.name])?;
    db.query_row("SELECT id FROM process_instances WHERE application_id=?1 AND instance_key=?2 AND process_id=?3 AND name=?4",params![app,p.instance_id,p.process_id,p.name],|r|r.get(0))
}

/// State equality is expressed with normalized entity IDs; only adjacent confirmed samples merge.
fn state(
    db: &Connection,
    table: &str,
    columns: &[(&str, rusqlite::types::Value)],
    previous: Option<i64>,
    id: i64,
    start: i64,
    end: i64,
) -> rusqlite::Result<()> {
    // Table/column names are private constants, never IPC or data input.
    let condition = columns
        .iter()
        .map(|(name, _)| format!("{name}=?"))
        .collect::<Vec<_>>()
        .join(" AND ");
    let mut values = columns.iter().map(|(_, v)| v.clone()).collect::<Vec<_>>();
    values.push(previous.unwrap_or(-1).into());
    let prior: Option<i64> = db
        .query_row(
            &format!(
                "SELECT id FROM {table} WHERE {}last_sample_id=? LIMIT 1",
                if condition.is_empty() {
                    String::new()
                } else {
                    format!("{condition} AND ")
                }
            ),
            rusqlite::params_from_iter(values),
            |r| r.get(0),
        )
        .optional()?;
    if let Some(prior) = prior {
        db.execute(
            &format!("UPDATE {table} SET end_ms=?1,last_sample_id=?2 WHERE id=?3"),
            params![end, id, prior],
        )?;
    } else {
        let names = columns
            .iter()
            .map(|(name, _)| *name)
            .collect::<Vec<_>>()
            .join(",");
        let mut values = columns.iter().map(|(_, v)| v.clone()).collect::<Vec<_>>();
        values.extend([start.into(), end.into(), id.into(), id.into()]);
        db.execute(
            &format!(
                "INSERT INTO {table}({}start_ms,end_ms,first_sample_id,last_sample_id) VALUES({})",
                if names.is_empty() {
                    String::new()
                } else {
                    format!("{names},")
                },
                vec!["?"; values.len()].join(",")
            ),
            rusqlite::params_from_iter(values),
        )?;
    }
    Ok(())
}

pub fn write(
    db: &Connection,
    s: &SystemObservation,
    original_id: Option<i64>,
    allow_continuation: bool,
) -> Result<(), String> {
    let integer = |v: u64| {
        i64::try_from(v).map_err(|_| "Value exceeds SQLite signed integer range".to_string())
    };
    let start = integer(s.captured_at_ms)?;
    let end = start
        .checked_add(2000)
        .ok_or("Timestamp exceeds interval range")?;
    let interval = s.interval_start_ms.map(integer).transpose()?;
    let last: Option<(i64, i64)> = db
        .query_row(
            "SELECT id,captured_at_ms FROM system_samples ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let previous = last
        .filter(|(_, time)| {
            allow_continuation && interval == Some(*time) && start > *time && start - *time <= 6000
        })
        .map(|(id, _)| id);
    if let Some((last_id, last_time)) = last.filter(|(_, time)| allow_continuation && start > *time)
    {
        // The next observation bounds the old sample's hold support, even if state changes.
        for table in TABLES {
            let bound = if previous.is_some() {
                start
            } else {
                (last_time + 2000).min(start)
            };
            db.execute(
                &format!("UPDATE {table} SET end_ms=?1 WHERE last_sample_id=?2"),
                params![bound, last_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    let activity = s.activity.as_ref();
    db.execute("INSERT INTO system_samples(id,captured_at_ms,interval_start_ms,cpu_percent,memory_used_bytes,memory_total_bytes,network_receive,network_send,disk_read,disk_write,audio_peak,errors_json,activity_present,background_observed,idle_ms) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)", params![original_id,start,interval,s.cpu_percent,s.memory_used_bytes.map(integer).transpose()?,s.memory_total_bytes.map(integer).transpose()?,s.network_receive_bytes_per_second,s.network_send_bytes_per_second,s.disk_read_bytes_per_second,s.disk_write_bytes_per_second,s.audio_peak_percent,serde_json::to_string(&s.errors).map_err(|e|e.to_string())?,activity.is_some(),activity.is_some_and(|a|a.background.is_some()),activity.and_then(|a|a.idle_ms).map(integer).transpose()?]).map_err(|e|e.to_string())?;
    let id = db.last_insert_rowid();
    // Legacy migration 4 has no input column; old observations always have None.
    if s.audio_input_peak_percent.is_some() {
        db.execute(
            "UPDATE system_samples SET audio_input_peak=?1 WHERE id=?2",
            params![s.audio_input_peak_percent, id],
        )
        .map_err(|e| e.to_string())?;
    }
    // Legacy migration 4 runs this writer before the hardware columns exist.
    if s.cpu_frequency_mhz.is_some() || s.gpus.is_some() || s.battery.is_some() {
        db.execute("UPDATE system_samples SET cpu_frequency_mhz=?1,gpus_json=?2,battery_json=?3 WHERE id=?4", params![s.cpu_frequency_mhz,
            s.gpus.as_ref().map(serde_json::to_string).transpose().map_err(|e|e.to_string())?,
            s.battery.as_ref().map(serde_json::to_string).transpose().map_err(|e|e.to_string())?,id]).map_err(|e|e.to_string())?;
    }
    let result = (|| -> rusqlite::Result<()> {
        if let Some(activity) = activity {
            if let Some(background) = &activity.background {
                let mut seen = std::collections::HashSet::new();
                for p in background {
                    let pid = process(db, p)?;
                    if seen.insert(pid) {
                        state(
                            db,
                            "app_presence_intervals",
                            &[("process_instance_id", pid.into())],
                            previous,
                            id,
                            start,
                            end,
                        )?;
                    }
                }
            }
            if let Some(window) = &activity.foreground {
                let pid = process(db, &window.process)?;
                db.execute("INSERT INTO windows(process_instance_id,handle) VALUES(?1,?2) ON CONFLICT DO NOTHING",params![pid,window.window_id])?;
                let wid: i64 = db.query_row(
                    "SELECT id FROM windows WHERE process_instance_id=?1 AND handle=?2",
                    params![pid, window.window_id],
                    |r| r.get(0),
                )?;
                let title = text(db, &window.title)?;
                state(
                    db,
                    "foreground_intervals",
                    &[("window_id", wid.into())],
                    previous,
                    id,
                    start,
                    end,
                )?;
                state(
                    db,
                    "window_title_intervals",
                    &[("window_id", wid.into()), ("title_id", title.into())],
                    previous,
                    id,
                    start,
                    end,
                )?;
            }
            if activity.idle_ms.is_some_and(|ms| ms >= 300000) {
                state(db, "idle_intervals", &[], previous, id, start, end)?;
            }
        }
        if let Some(media) = &s.media {
            let title = text(db, &media.title)?;
            let artist = text(db, &media.artist)?;
            let source = text(db, &media.application)?;
            db.execute("INSERT INTO media_items(title_id,artist_id,source_id) VALUES(?1,?2,?3) ON CONFLICT DO NOTHING",params![title,artist,source])?;
            let item: i64 = db.query_row(
                "SELECT id FROM media_items WHERE title_id=?1 AND artist_id=?2 AND source_id=?3",
                params![title, artist, source],
                |r| r.get(0),
            )?;
            state(
                db,
                "media_intervals",
                &[
                    ("media_item_id", item.into()),
                    ("playback_status", media.playback_status.clone().into()),
                ],
                previous,
                id,
                start,
                end,
            )?;
        }
        Ok(())
    })();
    result.map_err(|e| e.to_string())
}

/// Convert legacy snapshots inside the same migration transaction, preserving IDs and every sample.
pub fn migrate(db: &Connection) -> Result<(), String> {
    let mut statement=db.prepare("SELECT o.id,o.captured_at_ms,o.interval_start_ms,o.cpu_percent,o.memory_used_bytes,o.memory_total_bytes,o.network_receive,o.network_send,o.disk_read,o.disk_write,o.audio_peak,o.media_json,o.errors_json,(SELECT payload FROM activity_values WHERE id=o.foreground_id),(SELECT payload FROM activity_values WHERE id=o.background_id),o.idle_ms,CASE WHEN o.foreground_id IS NULL AND o.background_id IS NULL AND o.idle_ms IS NULL THEN 0 ELSE 1 END FROM observations o ORDER BY o.id").map_err(|e|e.to_string())?;
    let rows = statement
        .query_map([], super::sqlite::decode)
        .map_err(|e| e.to_string())?;
    let mut continuation = false;
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        write(db, &row.sample, Some(row.id as i64), continuation)?;
        continuation = true;
    }
    drop(statement);
    db.execute_batch("DROP TABLE observations; DROP TABLE activity_values;")
        .map_err(|e| e.to_string())
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Interval<T> {
    pub id: i64,
    pub start_ms: u64,
    pub end_ms: u64,
    pub value: T,
}
#[derive(Debug, serde::Serialize)]
pub struct StateIntervals {
    pub apps: Vec<Interval<tracel_core::ProcessObservation>>,
    pub foreground: Vec<Interval<tracel_core::WindowObservation>>,
    pub media: Vec<Interval<tracel_core::MediaObservation>>,
    pub idle: Vec<Interval<()>>,
}
fn process_row(r: &rusqlite::Row<'_>, at: usize) -> rusqlite::Result<ProcessObservation> {
    Ok(ProcessObservation {
        instance_id: r.get(at)?,
        process_id: r.get(at + 1)?,
        name: r.get(at + 2)?,
        executable: r.get(at + 3)?,
    })
}
pub fn query(db: &Connection, start: u64, end: u64) -> Result<StateIntervals, String> {
    fn read<T, F: FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>>(
        db: &Connection,
        sql: &str,
        start: u64,
        end: u64,
        mut value: F,
    ) -> Result<Vec<Interval<T>>, String> {
        let mut statement = db.prepare(sql).map_err(|e| e.to_string())?;
        let rows = statement
            .query_map(params![start as i64, end as i64], |r| {
                Ok(Interval {
                    id: r.get(0)?,
                    start_ms: r.get::<_, i64>(1)? as u64,
                    end_ms: r.get::<_, i64>(2)? as u64,
                    value: value(r)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let values: Vec<_> = rows.collect::<Result<_, _>>().map_err(|e| e.to_string())?;
        if values.len() > 50000 {
            return Err("Too many state intervals for this day".into());
        }
        Ok(values)
    }
    let apps=read(db,"SELECT i.id,i.start_ms,i.end_ms,p.instance_key,p.process_id,p.name,a.executable FROM app_presence_intervals i JOIN process_instances p ON p.id=i.process_instance_id JOIN applications a ON a.id=p.application_id WHERE i.start_ms<?2 AND i.end_ms>?1 ORDER BY i.start_ms,i.id LIMIT 50001",start,end,|r|process_row(r,3))?;
    // Split foreground focus by title transitions at query time; changing a title never splits app presence.
    let foreground=read(db,"SELECT t.id,MAX(f.start_ms,t.start_ms),MIN(f.end_ms,t.end_ms),p.instance_key,p.process_id,p.name,a.executable,w.handle,s.value FROM foreground_intervals f JOIN windows w ON w.id=f.window_id JOIN process_instances p ON p.id=w.process_instance_id JOIN applications a ON a.id=p.application_id JOIN window_title_intervals t ON t.window_id=w.id AND t.start_ms<f.end_ms AND t.end_ms>f.start_ms AND t.first_sample_id<=f.last_sample_id AND t.last_sample_id>=f.first_sample_id JOIN strings s ON s.id=t.title_id WHERE f.start_ms<?2 AND f.end_ms>?1 AND t.start_ms<?2 AND t.end_ms>?1 ORDER BY f.start_ms,t.start_ms,t.id LIMIT 50001",start,end,|r|Ok(tracel_core::WindowObservation {process:process_row(r,3)?,window_id:r.get(7)?,title:r.get(8)?}))?;
    let media=read(db,"SELECT i.id,i.start_ms,i.end_ms,t.value,a.value,s.value,i.playback_status FROM media_intervals i JOIN media_items m ON m.id=i.media_item_id JOIN strings t ON t.id=m.title_id JOIN strings a ON a.id=m.artist_id JOIN strings s ON s.id=m.source_id WHERE i.start_ms<?2 AND i.end_ms>?1 ORDER BY i.start_ms,i.id LIMIT 50001",start,end,|r|Ok(tracel_core::MediaObservation{title:r.get(3)?,artist:r.get(4)?,application:r.get(5)?,playback_status:r.get(6)?}))?;
    let idle=read(db,"SELECT id,start_ms,end_ms FROM idle_intervals WHERE start_ms<?2 AND end_ms>?1 ORDER BY start_ms,id LIMIT 50001",start,end,|_|Ok(()))?;
    if apps.len() + foreground.len() + media.len() + idle.len() > 50000 {
        return Err("Too many state intervals for this day".into());
    }
    Ok(StateIntervals {
        apps,
        foreground,
        media,
        idle,
    })
}
