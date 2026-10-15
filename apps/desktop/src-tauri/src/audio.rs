//! On-demand session metering. No waveform capture or audio-policy writes.
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{Arc, Condvar, Mutex},
    thread::JoinHandle,
    time::{Duration, Instant},
};

#[cfg(windows)]
#[path = "audio_windows.rs"]
mod platform;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub direction: String,
    pub default_roles: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub device_id: String,
    pub process_id: u32,
    pub name: String,
    pub executable: Option<String>,
    pub system_sounds: bool,
    pub multi_process: bool,
    pub state: String,
    pub peak_percent: Option<f64>,
    pub volume_percent: Option<f64>,
    pub muted: Option<bool>,
    pub last_heard_at_ms: Option<u64>,
    pub held_peak_percent: f64,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub monitoring: bool,
    pub captured_at_ms: u64,
    pub devices: Vec<Device>,
    pub sessions: Vec<Session>,
    pub errors: Vec<String>,
}
struct Recent {
    session: Session,
    last_signal: Option<Instant>,
}
#[derive(Default)]
struct History(BTreeMap<String, Recent>);
impl History {
    fn update(&mut self, sessions: Vec<Session>, now: Instant, timestamp: u64) -> Vec<Session> {
        for old in self.0.values_mut() {
            old.session.state = "ended".into();
            old.session.peak_percent = None;
        }
        for mut session in sessions {
            let old = self.0.remove(&session.id);
            let mut last_signal = old.as_ref().and_then(|s| s.last_signal);
            if let Some(old) = old {
                session.last_heard_at_ms = old.session.last_heard_at_ms;
                session.held_peak_percent = old.session.held_peak_percent;
                if last_signal
                    .is_some_and(|t| now.saturating_duration_since(t) > Duration::from_secs(60))
                {
                    last_signal = None;
                    session.last_heard_at_ms = None;
                    session.held_peak_percent = 0.0;
                }
            }
            if session.peak_percent.is_some_and(|v| v >= 0.1) && session.muted != Some(true) {
                session.last_heard_at_ms = Some(timestamp);
                session.held_peak_percent =
                    session.held_peak_percent.max(session.peak_percent.unwrap());
                last_signal = Some(now);
            }
            self.0.insert(
                session.id.clone(),
                Recent {
                    session,
                    last_signal,
                },
            );
        }
        self.0.retain(|_, s| {
            s.session.state != "ended"
                || s.last_signal
                    .is_some_and(|t| now.saturating_duration_since(t) <= Duration::from_secs(60))
        });
        // Bound vanished sessions; current sessions are bounded separately by the reader.
        while self.0.len() > 512 {
            let oldest = self
                .0
                .iter()
                .filter(|(_, s)| s.session.state == "ended")
                .min_by_key(|(_, s)| s.last_signal)
                .map(|(id, _)| id.clone());
            if let Some(id) = oldest {
                self.0.remove(&id);
            } else {
                break;
            }
        }
        let mut rows: Vec<_> = self.0.values().map(|s| s.session.clone()).collect();
        rows.sort_by(|a, b| {
            b.last_heard_at_ms
                .cmp(&a.last_heard_at_ms)
                .then_with(|| a.name.cmp(&b.name))
        });
        rows
    }
}
struct State {
    snapshot: Snapshot,
    stopping: bool,
    revision: u64,
}
pub struct Monitor {
    shared: Arc<(Mutex<State>, Condvar)>,
    worker: Mutex<Option<JoinHandle<()>>>,
}
impl Monitor {
    pub fn new() -> std::io::Result<Self> {
        let shared = Arc::new((
            Mutex::new(State {
                snapshot: Snapshot::default(),
                stopping: false,
                revision: 0,
            }),
            Condvar::new(),
        ));
        let worker_shared = shared.clone();
        let worker = std::thread::Builder::new()
            .name("tracel-audio-monitor".into())
            .spawn(move || {
                #[cfg(windows)]
                let mut reader: Option<platform::Reader> = None;
                let mut history = History::default();
                let (lock, wake) = &*worker_shared;
                let mut state = lock.lock().unwrap_or_else(|e| e.into_inner());
                loop {
                    if state.stopping {
                        break;
                    }
                    if !state.snapshot.monitoring {
                        #[cfg(windows)]
                        {
                            reader = None;
                        }
                        for session in &mut state.snapshot.sessions {
                            session.peak_percent = None;
                        }
                        state = wake.wait(state).unwrap_or_else(|e| e.into_inner());
                        continue;
                    }
                    let revision = state.revision;
                    drop(state);
                    #[cfg(windows)]
                    let result = (|| {
                        if reader.is_none() {
                            reader = Some(platform::Reader::new()?);
                        }
                        reader.as_mut().unwrap().read()
                    })();
                    #[cfg(not(windows))]
                    let result: Result<Snapshot, String> =
                        Err("Audio monitoring requires Windows".into());
                    state = lock.lock().unwrap_or_else(|e| e.into_inner());
                    if state.stopping || revision != state.revision {
                        continue;
                    }
                    let delay = match result {
                        Ok(mut snapshot) => {
                            snapshot.monitoring = true;
                            snapshot.sessions = history.update(
                                snapshot.sessions,
                                Instant::now(),
                                snapshot.captured_at_ms,
                            );
                            state.snapshot = snapshot;
                            Duration::from_millis(50)
                        }
                        Err(error) => {
                            #[cfg(windows)]
                            {
                                reader = None;
                            }
                            state.snapshot.errors = vec![error];
                            for session in &mut state.snapshot.sessions {
                                session.peak_percent = None;
                            }
                            Duration::from_secs(1)
                        }
                    };
                    state = wake
                        .wait_timeout(state, delay)
                        .unwrap_or_else(|e| e.into_inner())
                        .0;
                }
            })?;
        Ok(Self {
            shared,
            worker: Mutex::new(Some(worker)),
        })
    }
    pub fn status(&self) -> Snapshot {
        let state = self.shared.0.lock().unwrap_or_else(|e| e.into_inner());
        state.snapshot.clone()
    }
    pub fn enable(&self, enabled: bool) -> Result<Snapshot, String> {
        if !cfg!(windows) {
            return Err("Audio monitoring requires Windows".into());
        }
        let mut state = self
            .shared
            .0
            .lock()
            .map_err(|_| "Audio monitor unavailable")?;
        state.snapshot.monitoring = enabled;
        state.revision += 1;
        if !enabled {
            for session in &mut state.snapshot.sessions {
                session.peak_percent = None;
            }
        }
        self.shared.1.notify_one();
        Ok(state.snapshot.clone())
    }
    pub fn stop(&self) {
        if let Ok(mut state) = self.shared.0.lock() {
            state.stopping = true;
            self.shared.1.notify_one();
        }
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                let _ = worker.join();
            }
        }
    }
}
impl Drop for Monitor {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn open_settings() -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::{core::w, Win32::UI::Shell::ShellExecuteW};
        let result = ShellExecuteW(
            std::ptr::null_mut(),
            w!("open"),
            w!("ms-settings:sound"),
            std::ptr::null(),
            std::ptr::null(),
            1,
        );
        if result as isize <= 32 {
            return Err(format!(
                "Could not open Windows sound settings: {}",
                result as isize
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("Sound settings require Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session(id: &str, peak: Option<f64>) -> Session {
        Session {
            id: id.into(),
            device_id: "speaker".into(),
            process_id: 42,
            name: "test.exe".into(),
            executable: None,
            system_sounds: false,
            multi_process: false,
            state: "active".into(),
            peak_percent: peak,
            volume_percent: Some(100.0),
            muted: Some(false),
            last_heard_at_ms: None,
            held_peak_percent: 0.0,
        }
    }
    #[test]
    fn brief_signals_survive_session_exit_but_not_retention_or_muting() {
        let mut history = History::default();
        let now = Instant::now();
        let rows = history.update(
            vec![session("a", Some(4.0)), session("b", Some(0.0))],
            now,
            1000,
        );
        assert_eq!(rows[0].last_heard_at_ms, Some(1000));
        let rows = history.update(vec![], now + Duration::from_secs(1), 2000);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].state, "ended");
        assert_eq!(rows[0].peak_percent, None);
        assert_eq!(rows[0].held_peak_percent, 4.0);
        assert!(history
            .update(vec![], now + Duration::from_secs(61), 62000)
            .is_empty());
        let mut muted = session("muted", Some(90.0));
        muted.muted = Some(true);
        assert_eq!(
            history.update(vec![muted], now, 70000)[0].last_heard_at_ms,
            None
        );
    }
    #[test]
    fn monitor_starts_idle_and_joins_on_stop() {
        let monitor = Monitor::new().unwrap();
        assert!(!monitor.status().monitoring);
        assert!(monitor.status().sessions.is_empty());
        monitor.stop();
        monitor.stop();
    }
    #[test]
    fn quiet_live_sessions_expire_recent_signal_and_missing_levels_stay_missing() {
        let mut history = History::default();
        let now = Instant::now();
        history.update(vec![session("a", Some(20.0))], now, 1000);
        let held = history.update(vec![session("a", None)], now + Duration::from_secs(2), 3000);
        assert_eq!(held[0].peak_percent, None);
        assert_eq!(held[0].held_peak_percent, 20.0);
        assert_eq!(held[0].last_heard_at_ms, Some(1000));
        let expired = history.update(
            vec![session("a", Some(0.0))],
            now + Duration::from_secs(61),
            62000,
        );
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0].peak_percent, Some(0.0));
        assert_eq!(expired[0].last_heard_at_ms, None);
        assert_eq!(expired[0].held_peak_percent, 0.0);
    }
    #[cfg(windows)]
    #[test]
    fn native_read_only_session_and_device_smoke() {
        let mut reader = platform::Reader::new().unwrap();
        let snapshot = reader.read().unwrap();
        assert!(snapshot.captured_at_ms > 0);
        assert!(snapshot.devices.iter().all(|d| !d.id.is_empty()));
        assert!(snapshot
            .sessions
            .iter()
            .all(|s| s.peak_percent.is_none_or(|v| (0.0..=100.0).contains(&v))));
        // No playback, recording, device change, volume write, or settings launch.
    }
}
