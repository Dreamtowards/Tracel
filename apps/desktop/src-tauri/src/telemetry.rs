use serde::Serialize;
use std::{
    collections::VecDeque,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex},
    thread::JoinHandle,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tracel_agent::{CollectionSettings, NativeReader, Sampler, SystemObservation, SystemReader};

pub const PERIOD_MS: u64 = 2000;
const MAX_SAMPLES: usize = 1800;
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

struct Inner {
    settings: CollectionSettings,
    revision: u64,
    samples: VecDeque<SystemObservation>,
    latest: Option<SystemObservation>,
    keep_awake_requested: bool,
    keep_awake_active: bool,
    power_error: Option<String>,
    stopping: bool,
    startup_warning: Option<String>,
    storage_error: Option<String>,
    persisted_count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    database_path: String,
    settings: CollectionSettings,
    supported: bool,
    period_ms: u64,
    sample_count: usize,
    latest: Option<SystemObservation>,
    keep_awake_requested: bool,
    keep_awake_active: bool,
    power_error: Option<String>,
    startup_warning: Option<String>,
    storage_error: Option<String>,
    persisted_count: u64,
}

pub struct Telemetry {
    shared: Arc<(Mutex<Inner>, Condvar)>,
    worker: Mutex<Option<JoinHandle<()>>>,
    settings_path: PathBuf,
    database_path: PathBuf,
}

impl Telemetry {
    #[cfg(test)]
    pub fn new(settings_path: PathBuf) -> std::io::Result<Self> {
        let database_path = settings_path.with_file_name("activity.sqlite3");
        Self::with_database(settings_path, database_path)
    }
    pub fn with_database(settings_path: PathBuf, database_path: PathBuf) -> std::io::Result<Self> {
        let (mut store, storage_error) = match tracel_storage::SqliteStore::open(&database_path) {
            Ok(store) => (Some(store), None),
            Err(error) => (None, Some(error)),
        };
        let recent = store.as_ref().map(|store| store.recent()).transpose();
        let count = store.as_ref().map(|store| store.count()).transpose();
        let storage_error = storage_error
            .or_else(|| recent.as_ref().err().cloned())
            .or_else(|| count.as_ref().err().cloned());
        let recent = recent.ok().flatten().unwrap_or_default();
        let persisted_count = count.ok().flatten().unwrap_or(0);
        let (settings, startup_warning) = match std::fs::read(&settings_path) {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(settings) => (settings, None),
                Err(_) => (
                    CollectionSettings::initial(),
                    Some(
                        "Saved settings could not be read. Collection is off until you enable it."
                            .into(),
                    ),
                ),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                (CollectionSettings::initial(), None)
            }
            Err(_) => (
                CollectionSettings::initial(),
                Some("Settings could not be loaded. Collection starts off.".into()),
            ),
        };
        let shared = Arc::new((
            Mutex::new(Inner {
                settings,
                revision: 0,
                samples: recent.into(),
                latest: None,
                keep_awake_requested: false,
                keep_awake_active: false,
                power_error: None,
                stopping: false,
                startup_warning,
                storage_error,
                persisted_count,
            }),
            Condvar::new(),
        ));
        let worker_shared = shared.clone();
        let worker = std::thread::Builder::new()
            .name("tracel-system-sampler".into())
            .spawn(move || {
                let (lock, wake) = &*worker_shared;
                let mut sampler = Sampler::default();
                let mut reader = NativeReader::default();
                let mut revision = u64::MAX;
                let mut last_sample: Option<Instant> = None;
                let mut inner = lock.lock().unwrap_or_else(|e| e.into_inner());
                loop {
                    if inner.stopping {
                        break;
                    }
                    if inner.keep_awake_requested != inner.keep_awake_active {
                        match super::tools::keep_awake(inner.keep_awake_requested) {
                            Ok(()) => {
                                inner.keep_awake_active = inner.keep_awake_requested;
                                inner.power_error = None;
                            }
                            Err(error) => {
                                inner.power_error = Some(error);
                                inner.keep_awake_requested = inner.keep_awake_active;
                            }
                        }
                    }
                    if inner.revision != revision {
                        sampler.reset();
                        reader.reset();
                        revision = inner.revision;
                    }
                    reader.configure(&inner.settings);
                    if inner.settings.collecting() && cfg!(windows) {
                        if last_sample.is_some_and(|time| {
                            time.elapsed() > Duration::from_millis(PERIOD_MS * 3)
                        }) {
                            sampler.reset();
                            reader.reset();
                        }
                        last_sample = Some(Instant::now());
                        // Native media providers may take time. Keep IPC and power requests responsive;
                        // discard an in-flight sample if settings changed while it was being read.
                        let settings = inner.settings.clone();
                        drop(inner);
                        let sample = sampler.sample(&settings, &mut reader, now_ms());
                        inner = lock.lock().unwrap_or_else(|e| e.into_inner());
                        if inner.stopping || inner.revision != revision {
                            continue;
                        }
                        if inner.samples.len() == MAX_SAMPLES {
                            inner.samples.pop_front();
                        }
                        inner.latest = Some(sample.clone());
                        inner.samples.push_back(sample.clone());
                        drop(inner);
                        let saved = store.as_mut().map(|store| store.append(&[sample]));
                        inner = lock.lock().unwrap_or_else(|e| e.into_inner());
                        if let Some(result) = saved {
                            match result {
                                Ok(()) => {
                                    inner.persisted_count += 1;
                                    inner.storage_error = None;
                                }
                                Err(error) => inner.storage_error = Some(error),
                            }
                        }
                        if inner.stopping || inner.revision != revision {
                            continue;
                        }
                        let waited = wake
                            .wait_timeout(inner, Duration::from_millis(PERIOD_MS))
                            .unwrap_or_else(|e| e.into_inner());
                        inner = waited.0;
                    } else {
                        sampler.reset();
                        reader.reset();
                        inner = wake.wait(inner).unwrap_or_else(|e| e.into_inner());
                    }
                }
                let _ = super::tools::keep_awake(false);
            })?;
        Ok(Self {
            shared,
            worker: Mutex::new(Some(worker)),
            settings_path,
            database_path,
        })
    }

    pub fn status(&self) -> Status {
        let inner = self.shared.0.lock().unwrap_or_else(|e| e.into_inner());
        Status {
            database_path: self.database_path.to_string_lossy().into_owned(),
            settings: inner.settings.clone(),
            supported: cfg!(windows),
            period_ms: PERIOD_MS,
            sample_count: inner.samples.len(),
            latest: inner.latest.clone(),
            keep_awake_requested: inner.keep_awake_requested,
            keep_awake_active: inner.keep_awake_active,
            power_error: inner.power_error.clone(),
            startup_warning: inner.startup_warning.clone(),
            storage_error: inner.storage_error.clone(),
            persisted_count: inner.persisted_count,
        }
    }

    pub fn set_settings(&self, settings: CollectionSettings) -> Result<Status, String> {
        let mut inner = self
            .shared
            .0
            .lock()
            .map_err(|_| "Collector state is unavailable")?;
        let bytes = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
        if let Some(parent) = self.settings_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let temp = self.settings_path.with_extension("json.tmp");
        std::fs::write(&temp, bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&temp, &self.settings_path).map_err(|e| e.to_string())?;
        inner.settings = settings;
        inner.latest = None;
        inner.revision += 1;
        inner.startup_warning = None;
        self.shared.1.notify_one();
        drop(inner);
        Ok(self.status())
    }

    pub fn request_awake(&self, enabled: bool) -> Result<Status, String> {
        if !cfg!(windows) {
            return Err("Power tools require Windows".into());
        }
        let mut inner = self
            .shared
            .0
            .lock()
            .map_err(|_| "Collector state is unavailable")?;
        inner.keep_awake_requested = enabled;
        inner.power_error = None;
        self.shared.1.notify_one();
        drop(inner);
        Ok(self.status())
    }

    pub fn database_path(&self) -> PathBuf {
        self.database_path.clone()
    }

    pub fn history(&self) -> Vec<SystemObservation> {
        self.shared
            .0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .samples
            .iter()
            .cloned()
            .collect()
    }

    pub fn stop(&self) {
        if let Ok(mut inner) = self.shared.0.lock() {
            inner.stopping = true;
            self.shared.1.notify_one();
        }
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
}
impl Drop for Telemetry {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_preference_write_does_not_enable_collection() {
        let folder = std::env::temp_dir().join(format!(
            "tracel-settings-error-{}-{}",
            std::process::id(),
            now_ms()
        ));
        std::fs::create_dir(&folder).unwrap();
        let blocked = folder.join("blocked");
        std::fs::write(&blocked, b"not a directory").unwrap();
        let service = Telemetry::new(blocked.join("collection.json")).unwrap();
        assert!(service
            .set_settings(CollectionSettings {
                enabled: true,
                cpu: true,
                ram: true,
                ..CollectionSettings::default()
            })
            .is_err());
        assert_eq!(service.status().settings, CollectionSettings::initial());
        assert_eq!(service.status().sample_count, 0);
        assert!(service.status().storage_error.is_some());
        service.stop();
        std::fs::remove_file(blocked).unwrap();
        std::fs::remove_dir(folder).unwrap();
    }
    #[test]
    #[cfg(windows)]
    fn enabled_runtime_records_real_metrics_and_stops_on_master_off() {
        let folder = std::env::temp_dir().join(format!(
            "tracel-live-test-{}-{}",
            std::process::id(),
            now_ms()
        ));
        let path = folder.join("collection.json");
        let service = Telemetry::new(path.clone()).unwrap();
        service
            .set_settings(CollectionSettings {
                enabled: true,
                cpu: true,
                ram: true,
                ..CollectionSettings::default()
            })
            .unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(8);
        while service.history().len() < 2 && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        let history = service.history();
        assert!(history.len() >= 2);
        assert!(
            history[0].cpu_percent.is_none(),
            "first CPU read must be warm-up, not fabricated zero"
        );
        let last = history.last().unwrap();
        assert!(last
            .cpu_percent
            .is_some_and(|value| (0.0..=100.0).contains(&value)));
        assert!(last.memory_total_bytes.unwrap() > 0);
        assert!(last.errors.is_empty());
        service.set_settings(CollectionSettings::initial()).unwrap();
        let count = service.history().len();
        std::thread::sleep(Duration::from_millis(PERIOD_MS + 100));
        assert_eq!(service.history().len(), count);
        assert!(service.status().latest.is_none());
        service.stop();
        assert!(service.status().persisted_count >= count as u64);
        drop(service);
        let reopened = Telemetry::new(path.clone()).unwrap();
        assert_eq!(reopened.history().len(), count);
        assert!(reopened.status().latest.is_none());
        reopened.stop();
        drop(reopened);
        std::fs::remove_file(folder.join("activity.sqlite3")).unwrap();
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(folder).unwrap();
    }
    #[test]
    fn disabled_runtime_is_idle_and_preferences_survive_reopen() {
        let folder = std::env::temp_dir().join(format!(
            "tracel-settings-test-{}-{}",
            std::process::id(),
            now_ms()
        ));
        let path = folder.join("collection.json");
        let service = Telemetry::new(path.clone()).unwrap();
        assert_eq!(service.status().sample_count, 0);
        assert_eq!(service.status().persisted_count, 0);
        assert!(service.status().storage_error.is_none());
        let settings = CollectionSettings {
            enabled: false,
            cpu: false,
            ram: true,
            ..CollectionSettings::default()
        };
        service.set_settings(settings.clone()).unwrap();
        assert_eq!(service.status().settings, settings);
        service.stop();
        drop(service);
        let reopened = Telemetry::new(path.clone()).unwrap();
        assert_eq!(reopened.status().settings, settings);
        assert!(!reopened.status().keep_awake_requested);
        reopened.stop();
        drop(reopened);
        std::fs::remove_file(folder.join("activity.sqlite3")).unwrap();
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(folder).unwrap();
    }
}
