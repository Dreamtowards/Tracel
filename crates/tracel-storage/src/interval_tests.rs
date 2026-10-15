use super::*;
use rusqlite::OptionalExtension;
use tracel_core::{ActivityObservation, MediaObservation, ProcessObservation, WindowObservation};

struct Fixture(std::path::PathBuf);
impl Fixture {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        Self(std::env::temp_dir().join(format!(
                "tracel-intervals-{}-{}-{}.sqlite3",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            )))
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", self.0.display()));
        }
    }
}
fn sample(time: u64) -> SystemObservation {
    let process = ProcessObservation {
        instance_id: "42:1234".into(),
        process_id: 42,
        name: "编辑器.exe".into(),
        executable: Some("C:\\编辑器.exe".into()),
    };
    SystemObservation {
        captured_at_ms: time,
        interval_start_ms: Some(time - 2000),
        cpu_percent: Some(0.0),
        activity: Some(ActivityObservation {
            foreground: Some(WindowObservation {
                process: process.clone(),
                window_id: "100".into(),
                title: "项目 A".into(),
            }),
            background: Some(vec![process]),
            idle_ms: Some(300000),
        }),
        media: Some(MediaObservation {
            title: "歌曲".repeat(100),
            artist: "作者".into(),
            application: "player.app".into(),
            playback_status: "Playing".into(),
        }),
        ..Default::default()
    }
}
fn count(store: &SqliteStore, table: &str) -> i64 {
    store
        .connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
        .unwrap()
}

#[test]
fn stationary_state_is_one_interval_and_metadata_is_interned() {
    let fixture = Fixture::new();
    let mut store = SqliteStore::open(&fixture.0).unwrap();
    let rows: Vec<_> = (0..1000).map(|i| sample(10000 + i * 2000)).collect();
    store.append(&rows).unwrap();
    assert_eq!(count(&store, "system_samples"), 1000);
    for table in [
        "applications",
        "process_instances",
        "windows",
        "media_items",
        "app_presence_intervals",
        "foreground_intervals",
        "window_title_intervals",
        "media_intervals",
        "idle_intervals",
    ] {
        assert_eq!(count(&store, table), 1, "{table}");
    }
    assert_eq!(count(&store, "strings"), 4);
    let page = SqliteStore::query(&fixture.0, 10000, 2010000, 0).unwrap();
    assert_eq!(page.intervals.apps[0].start_ms, 10000);
    assert_eq!(page.intervals.apps[0].end_ms, 2010000);
    assert!(page
        .observations
        .iter()
        .all(|r| r.sample.media.is_none() && r.sample.activity.is_none()));
    assert_eq!(store.recent().unwrap(), rows);
    assert!(store
        .connection
        .query_row("PRAGMA foreign_key_check", [], |_| Ok(()))
        .optional()
        .unwrap()
        .is_none());
}

#[test]
fn title_changes_media_pause_missing_and_reopen_have_independent_boundaries() {
    let fixture = Fixture::new();
    let mut store = SqliteStore::open(&fixture.0).unwrap();
    let mut rows = vec![
        sample(10000),
        sample(12000),
        sample(14000),
        sample(16000),
        sample(18000),
        sample(40000),
        sample(42000),
    ];
    rows[1]
        .activity
        .as_mut()
        .unwrap()
        .foreground
        .as_mut()
        .unwrap()
        .title = "项目 B".into();
    rows[2].media.as_mut().unwrap().playback_status = "Paused".into();
    rows[3].media = None;
    rows[3].activity = None;
    rows[5].interval_start_ms = None;
    store.append(&rows).unwrap();
    let first = SqliteStore::query(&fixture.0, 0, 50000, 0).unwrap();
    assert_eq!(first.intervals.apps.len(), 3);
    assert_eq!(first.intervals.foreground.len(), 5);
    assert_eq!(first.intervals.media.len(), 4);
    assert_eq!(first.intervals.media[1].value.playback_status, "Paused");
    assert_eq!(first.intervals.apps[0].end_ms, 16000);
    assert_eq!(first.intervals.apps[2].start_ms, 40000);
    assert_eq!(first.intervals.apps[2].end_ms, 44000);
    assert_eq!(store.recent().unwrap(), rows);
    drop(store);
    let mut store = SqliteStore::open(&fixture.0).unwrap();
    store.append(&[sample(44000)]).unwrap();
    let page = SqliteStore::query(&fixture.0, 0, 50000, first.next_cursor).unwrap();
    assert_eq!(page.observations.len(), 1);
    assert_eq!(
        page.intervals.apps.len(),
        4,
        "restart must not merge with the previous writer session"
    );
    assert_eq!(
        count(&store, "media_items"),
        1,
        "pause and restart reuse metadata"
    );
    assert_eq!(
        count(&store, "strings"),
        5,
        "recurring titles reuse their text"
    );
}

#[test]
fn process_reuse_and_live_tail_updates_are_not_lost_by_sample_cursor() {
    let fixture = Fixture::new();
    let mut store = SqliteStore::open(&fixture.0).unwrap();
    store.append(&[sample(10000)]).unwrap();
    let first = SqliteStore::query(&fixture.0, 0, 30000, 0).unwrap();
    store.append(&[sample(12000)]).unwrap();
    let second = SqliteStore::query(&fixture.0, 0, 30000, first.next_cursor).unwrap();
    assert_eq!(second.intervals.apps[0].id, first.intervals.apps[0].id);
    assert_eq!(second.intervals.apps[0].end_ms, 14000);
    let mut reused = sample(14000);
    let activity = reused.activity.as_mut().unwrap();
    activity.foreground.as_mut().unwrap().process.instance_id = "42:9999".into();
    activity.background.as_mut().unwrap()[0].instance_id = "42:9999".into();
    store.append(&[reused]).unwrap();
    assert_eq!(count(&store, "applications"), 1);
    assert_eq!(count(&store, "process_instances"), 2);
    assert_eq!(count(&store, "windows"), 2);
    assert_eq!(count(&store, "app_presence_intervals"), 2);
}

#[test]
fn v3_migration_preserves_media_activity_ids_and_rolls_back_invalid_history() {
    let fixture = Fixture::new();
    let old = Connection::open(&fixture.0).unwrap();
    for m in MIGRATIONS.iter().take(3) {
        old.execute_batch(m.sql).unwrap();
    }
    old.pragma_update(None, "user_version", 3).unwrap();
    let row = sample(10000);
    let activity = row.activity.as_ref().unwrap();
    old.execute(
        "INSERT INTO activity_values(id,payload) VALUES(60,?1),(61,?2)",
        params![
            serde_json::to_string(&activity.background.as_ref().unwrap()).unwrap(),
            serde_json::to_string(&activity.foreground.as_ref().unwrap()).unwrap()
        ],
    )
    .unwrap();
    for i in 0..10 {
        old.execute("INSERT INTO observations(id,captured_at_ms,interval_start_ms,cpu_percent,media_json,errors_json,foreground_id,background_id,idle_ms) VALUES(?1,?2,?3,0,?4,'[]',61,60,300000)",params![10+i,10000+i*2000,8000+i*2000,serde_json::to_string(&row.media).unwrap()]).unwrap();
    }
    drop(old);
    let migrated = SqliteStore::open(&fixture.0).unwrap();
    assert_eq!(migrated.count().unwrap(), 10);
    let page = SqliteStore::query(&fixture.0, 0, 40000, 0).unwrap();
    assert_eq!(page.observations[0].id, 10);
    assert_eq!(page.next_cursor, 19);
    assert_eq!(page.intervals.media.len(), 1);
    assert_eq!(page.intervals.apps.len(), 1);
    assert_eq!(migrated.recent().unwrap()[0], row);
    assert_eq!(migrated.connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE name IN ('observations','activity_values')",[],|r|r.get::<_,i64>(0)).unwrap(),0);
    drop(migrated);

    let bad = Fixture::new();
    let db = Connection::open(&bad.0).unwrap();
    for m in MIGRATIONS.iter().take(3) {
        db.execute_batch(m.sql).unwrap();
    }
    db.pragma_update(None, "user_version", 3).unwrap();
    db.execute("INSERT INTO observations(captured_at_ms,media_json,errors_json) VALUES(10000,'broken json','[]')",[]).unwrap();
    drop(db);
    assert!(SqliteStore::open(&bad.0).is_err());
    let db = Connection::open(&bad.0).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        3
    );
    assert_eq!(
        db.query_row("SELECT media_json FROM observations", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "broken json"
    );
    assert_eq!(
        db.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name='media_intervals'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}
