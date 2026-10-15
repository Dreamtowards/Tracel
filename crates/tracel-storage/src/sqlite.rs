use super::MIGRATIONS;
use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::{path::Path, time::Duration};
use tracel_core::SystemObservation;

pub struct SqliteStore {
    connection: Connection,
    continuation: bool,
}
#[derive(Debug, Serialize)]
pub struct StoredObservation {
    pub id: u64,
    pub sample: SystemObservation,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivePage {
    pub observations: Vec<StoredObservation>,
    pub next_cursor: u64,
    pub first_at_ms: Option<u64>,
    pub last_at_ms: Option<u64>,
    pub intervals: super::intervals::StateIntervals,
}
impl SqliteStore {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut connection = Connection::open(path).map_err(|e| e.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(2))
            .map_err(|e| e.to_string())?;
        let version: u32 = connection
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > MIGRATIONS.last().unwrap().version {
            return Err("Database was created by a newer Tracel version.".into());
        }
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(|e| e.to_string())?;
        connection
            .pragma_update(None, "synchronous", "FULL")
            .map_err(|e| e.to_string())?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| e.to_string())?;
        let transaction = connection.transaction().map_err(|e| e.to_string())?;
        for migration in MIGRATIONS.iter().filter(|m| m.version > version) {
            if migration.version == 4 {
                let count: i64 = transaction
                    .query_row("SELECT COUNT(*) FROM system_samples", [], |r| r.get(0))
                    .map_err(|e| e.to_string())?;
                if count != 0 {
                    return Err("Reserved system_samples table contains unexpected data; migration cancelled".into());
                }
            }
            transaction
                .execute_batch(migration.sql)
                .map_err(|e| e.to_string())?;
            if migration.version == 4 {
                super::intervals::migrate(&transaction)?;
            }
            transaction
                .pragma_update(None, "user_version", migration.version)
                .map_err(|e| e.to_string())?;
        }
        transaction.commit().map_err(|e| e.to_string())?;
        Ok(Self {
            connection,
            continuation: false,
        })
    }
    pub fn append(&mut self, samples: &[SystemObservation]) -> Result<(), String> {
        let transaction = self.connection.transaction().map_err(|e| e.to_string())?;
        let mut continuation = self.continuation;
        for sample in samples {
            super::intervals::write(&transaction, sample, None, continuation)?;
            continuation = true;
        }
        transaction.commit().map_err(|e| e.to_string())?;
        self.continuation = continuation;
        Ok(())
    }
    pub fn count(&self) -> Result<u64, String> {
        self.connection
            .query_row("SELECT COUNT(*) FROM system_samples", [], |r| {
                r.get::<_, i64>(0)
            })
            .map(|v| v as u64)
            .map_err(|e| e.to_string())
    }
    pub fn recent(&self) -> Result<Vec<SystemObservation>, String> {
        let mut statement = self.connection.prepare("SELECT * FROM (SELECT * FROM archived_observations ORDER BY id DESC LIMIT 1800) ORDER BY id").map_err(|e|e.to_string())?;
        let rows = statement.query_map([], decode).map_err(|e| e.to_string())?;
        rows.map(|r| r.map(|v| v.sample).map_err(|e| e.to_string()))
            .collect()
    }
    /// One local calendar day (including DST), never unbounded history over IPC.
    /// Cursor is a row identity, independent of wall-clock changes and timestamps.
    pub fn query(path: &Path, start: u64, end: u64, after_id: u64) -> Result<ArchivePage, String> {
        if start >= end
            || end - start > 25 * 3600 * 1000
            || end > i64::MAX as u64 - 6000
            || after_id > i64::MAX as u64
        {
            return Err("Query must cover at most one calendar day.".into());
        }
        let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|e| e.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(2))
            .map_err(|e| e.to_string())?;
        let connection = connection
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let mut statement = connection.prepare("SELECT id,captured_at_ms,interval_start_ms,cpu_percent,memory_used_bytes,memory_total_bytes,network_receive,network_send,disk_read,disk_write,audio_peak,NULL,errors_json,NULL,NULL,NULL,0 FROM system_samples WHERE id > ?1 AND captured_at_ms >= ?2 AND captured_at_ms < ?3 ORDER BY id LIMIT 50001").map_err(|e|e.to_string())?;
        let observations: Vec<_> = statement
            .query_map(
                params![
                    after_id as i64,
                    start.saturating_sub(6000) as i64,
                    (end + 6000) as i64
                ],
                decode,
            )
            .map_err(|e| e.to_string())?
            .collect::<Result<_, _>>()
            .map_err(|e| e.to_string())?;
        if observations.len() > 50000 {
            return Err("Too many observations for this day. A finer query is required.".into());
        }
        let first_at_ms = connection
            .query_row("SELECT MIN(captured_at_ms) FROM system_samples", [], |r| {
                r.get::<_, Option<i64>>(0)
            })
            .map_err(|e| e.to_string())?
            .map(|v| v as u64);
        let last_at_ms = connection
            .query_row("SELECT MAX(captured_at_ms) FROM system_samples", [], |r| {
                r.get::<_, Option<i64>>(0)
            })
            .map_err(|e| e.to_string())?
            .map(|v| v as u64);
        let next_cursor = observations.last().map_or(after_id, |row| row.id);
        Ok(ArchivePage {
            observations,
            next_cursor,
            first_at_ms,
            last_at_ms,
            intervals: super::intervals::query(&connection, start, end)?,
        })
    }
}
pub(crate) fn decode(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredObservation> {
    fn json<T: serde::de::DeserializeOwned>(text: &str, column: usize) -> rusqlite::Result<T> {
        serde_json::from_str(text).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                column,
                rusqlite::types::Type::Text,
                Box::new(e),
            )
        })
    }
    let media: Option<String> = row.get(11)?;
    let errors: String = row.get(12)?;
    Ok(StoredObservation {
        id: unsigned(row, 0)?,
        sample: SystemObservation {
            captured_at_ms: unsigned(row, 1)?,
            interval_start_ms: row.get::<_, Option<i64>>(2)?.map(|v| v as u64),
            cpu_percent: row.get(3)?,
            memory_used_bytes: row.get::<_, Option<i64>>(4)?.map(|v| v as u64),
            memory_total_bytes: row.get::<_, Option<i64>>(5)?.map(|v| v as u64),
            network_receive_bytes_per_second: row.get(6)?,
            network_send_bytes_per_second: row.get(7)?,
            disk_read_bytes_per_second: row.get(8)?,
            disk_write_bytes_per_second: row.get(9)?,
            audio_peak_percent: row.get(10)?,
            media: media.map(|s| json(&s, 11)).transpose()?,
            errors: json(&errors, 12)?,
            activity: {
                let foreground: Option<String> = row.get(13)?;
                let background: Option<String> = row.get(14)?;
                let idle: Option<i64> = row.get(15)?;
                if !row.get::<_, bool>(16)? {
                    None
                } else {
                    Some(tracel_core::ActivityObservation {
                        foreground: foreground.map(|s| json(&s, 13)).transpose()?,
                        background: background.map(|s| json(&s, 14)).transpose()?,
                        idle_ms: idle.map(|v| v as u64),
                    })
                }
            },
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn version_two_history_is_preserved_when_activity_columns_are_added() {
        let path = std::env::temp_dir().join(format!(
            "tracel-v2-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let old = Connection::open(&path).unwrap();
        for migration in MIGRATIONS.iter().take(2) {
            old.execute_batch(migration.sql).unwrap();
        }
        old.pragma_update(None, "user_version", 2).unwrap();
        old.execute("INSERT INTO observations(captured_at_ms,cpu_percent,errors_json) VALUES(10000,12,'[]')",[]).unwrap();
        drop(old);
        let migrated = SqliteStore::open(&path).unwrap();
        let history = migrated.recent().unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].cpu_percent, Some(12.0));
        assert!(history[0].activity.is_none());
        assert_eq!(
            migrated
                .connection
                .pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
                .unwrap(),
            4
        );
        drop(migrated);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn persistence_intervals_nulls_unicode_cursors_and_atomic_batch_failure() {
        let path = std::env::temp_dir().join(format!(
            "tracel-db-test-{}-{}.sqlite3",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut store = SqliteStore::open(&path).unwrap();
        let sample = SystemObservation {
            captured_at_ms: 10000,
            interval_start_ms: Some(8000),
            cpu_percent: Some(0.0),
            activity: Some(tracel_core::ActivityObservation {
                foreground: Some(tracel_core::WindowObservation {
                    process: tracel_core::ProcessObservation {
                        instance_id: "42:123".into(),
                        process_id: 42,
                        name: "Editor.exe".into(),
                        executable: Some("C:\\Editor.exe".into()),
                    },
                    window_id: "100".into(),
                    title: "测试文档".into(),
                }),
                background: Some(vec![]),
                idle_ms: Some(300000),
            }),
            media: Some(tracel_core::MediaObservation {
                title: "测试曲目".into(),
                artist: "Artist".into(),
                application: "player.app".into(),
                playback_status: "Playing".into(),
            }),
            errors: vec!["测试".into()],
            ..Default::default()
        };
        store.append(&[sample.clone()]).unwrap();
        // Second row violates interval constraint: the entire batch must roll back.
        assert!(store
            .append(&[
                sample.clone(),
                SystemObservation {
                    interval_start_ms: Some(20000),
                    ..sample.clone()
                }
            ])
            .is_err());
        assert_eq!(store.count().unwrap(), 1);
        drop(store);
        let reopened = SqliteStore::open(&path).unwrap();
        assert_eq!(reopened.recent().unwrap(), vec![sample.clone()]);
        let page = SqliteStore::query(&path, 9000, 11000, 0).unwrap();
        assert!(page.observations[0].sample.media.is_none());
        assert!(page.observations[0].sample.activity.is_none());
        assert_eq!(page.intervals.media[0].value, sample.media.clone().unwrap());
        assert_eq!(
            page.intervals.foreground[0].value,
            sample.activity.clone().unwrap().foreground.unwrap()
        );
        assert!(SqliteStore::query(&path, 9000, 11000, page.next_cursor)
            .unwrap()
            .observations
            .is_empty());
        assert_eq!(page.first_at_ms, Some(10000));
        let mut writer = reopened;
        writer
            .append(&[SystemObservation {
                captured_at_ms: 12000,
                ..sample.clone()
            }])
            .unwrap();
        let incremental = SqliteStore::query(&path, 9000, 13000, page.next_cursor).unwrap();
        assert_eq!(incremental.observations.len(), 1);
        assert_eq!(incremental.observations[0].sample.captured_at_ms, 12000);
        assert_eq!(
            writer
                .connection
                .query_row("SELECT COUNT(*) FROM process_instances", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            1,
            "process metadata must be deduplicated"
        );
        assert!(SqliteStore::query(&path, 0, 26 * 3600 * 1000, 0).is_err());
        drop(writer);
        // A future-version database must be rejected without rewriting its version or rows.
        let future = Connection::open(&path).unwrap();
        future.pragma_update(None, "user_version", 999).unwrap();
        drop(future);
        assert!(SqliteStore::open(&path).is_err());
        let future = Connection::open(&path).unwrap();
        assert_eq!(
            future
                .pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
                .unwrap(),
            999
        );
        assert_eq!(
            future
                .query_row("SELECT COUNT(*) FROM system_samples", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            2
        );
        drop(future);
        std::fs::remove_file(path).unwrap();
    }
}

fn unsigned(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<u64> {
    let value: i64 = row.get(index)?;
    u64::try_from(value).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Integer,
            Box::new(e),
        )
    })
}

#[cfg(test)]
#[path = "interval_tests.rs"]
mod interval_tests;
