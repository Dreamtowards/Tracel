#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod app_icons;
mod audio;
mod categories;
mod file_usage;
mod screen_timeout;
mod storage_tools;
mod system_tools;
mod telemetry;
mod tools;
use tauri::Manager;
use tracel_agent::CollectionSettings;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    platform: &'static str,
    device_name: String,
}

#[tauri::command]
async fn developer_environment() -> Result<system_tools::EnvironmentReport, String> {
    tauri::async_runtime::spawn_blocking(system_tools::environment)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn windows_update_policy(action: String) -> Result<system_tools::UpdateStatus, String> {
    tauri::async_runtime::spawn_blocking(move || system_tools::updates(&action))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn open_system_shortcut(target: String) -> Result<(), String> {
    system_tools::open_shortcut(&target)
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
        device_name: std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "This device".into()),
    }
}

#[tauri::command]
fn audio_status(state: tauri::State<'_, audio::Monitor>) -> audio::Snapshot {
    state.status()
}
#[tauri::command]
async fn open_database_folder(state: tauri::State<'_, telemetry::Telemetry>) -> Result<(), String> {
    let path = state.database_path();
    tauri::async_runtime::spawn_blocking(move || storage_tools::open_database_folder(&path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn media_sessions() -> Result<tracel_agent::MediaSessions, String> {
    tauri::async_runtime::spawn_blocking(|| {
        static SCAN: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = SCAN
            .try_lock()
            .map_err(|_| "A media scan is already in progress".to_string())?;
        tracel_agent::media_sessions()
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn set_audio_monitor(
    enabled: bool,
    state: tauri::State<'_, audio::Monitor>,
) -> Result<audio::Snapshot, String> {
    state.enable(enabled)
}
#[tauri::command]
fn open_sound_settings() -> Result<(), String> {
    audio::open_settings()
}

#[tauri::command]
fn collection_status(state: tauri::State<'_, telemetry::Telemetry>) -> telemetry::Status {
    state.status()
}
#[tauri::command]
fn set_collection_settings(
    settings: CollectionSettings,
    state: tauri::State<'_, telemetry::Telemetry>,
) -> Result<telemetry::Status, String> {
    state.set_settings(settings)
}
#[tauri::command]
fn system_history(
    state: tauri::State<'_, telemetry::Telemetry>,
) -> Vec<tracel_agent::SystemObservation> {
    state.history()
}
#[tauri::command]
async fn timeline_observations(
    start_ms: u64,
    end_ms: u64,
    after_id: u64,
    state: tauri::State<'_, telemetry::Telemetry>,
) -> Result<tracel_storage::ArchivePage, String> {
    let path = state.database_path();
    tauri::async_runtime::spawn_blocking(move || {
        tracel_storage::SqliteStore::query(&path, start_ms, end_ms, after_id)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn set_keep_awake(
    enabled: bool,
    state: tauri::State<'_, telemetry::Telemetry>,
) -> Result<telemetry::Status, String> {
    state.request_awake(enabled)
}
#[tauri::command]
async fn inspect_foreground() -> Result<tracel_agent::ForegroundInfo, String> {
    tauri::async_runtime::spawn_blocking(|| {
        std::thread::sleep(std::time::Duration::from_secs(3));
        tracel_agent::foreground_info(telemetry::now_ms())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn inspect_file_usage(path: String) -> Result<file_usage::FileUsage, String> {
    tauri::async_runtime::spawn_blocking(move || file_usage::inspect(&path))
        .await
        .map_err(|error| error.to_string())?
}
#[tauri::command]
fn display_off() -> Result<(), String> {
    // Keep old IPC callers harmless too. No timers, broadcasts, or power changes.
    Err("Display-off is disabled after a wake-up reliability issue.".into())
}

#[tauri::command]
async fn read_display_timeout() -> Result<screen_timeout::Timeout, String> {
    tauri::async_runtime::spawn_blocking(screen_timeout::read)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn set_display_timeout(
    expected: screen_timeout::Timeout,
    ac_seconds: u32,
    dc_seconds: u32,
) -> Result<screen_timeout::Timeout, String> {
    tauri::async_runtime::spawn_blocking(move || {
        screen_timeout::update(expected, ac_seconds, dc_seconds)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod safety_tests {
    #[test]
    fn display_off_is_rejected_even_for_repeated_native_calls() {
        for _ in 0..10 {
            assert!(super::display_off().is_err());
        }
    }
}

#[tauri::command]
async fn category_configuration(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("categories.json");
    tauri::async_runtime::spawn_blocking(move || {
        let config = categories::read(&path)?;
        Ok(serde_json::json!({ "path": path, "config": config }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn application_icon(
    executable: String,
    app: tauri::AppHandle,
) -> Result<Option<Vec<u8>>, String> {
    let folder = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("icon-cache");
    tauri::async_runtime::spawn_blocking(move || app_icons::load(&executable, &folder))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_category_folder(app: tauri::AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("categories.json");
    tauri::async_runtime::spawn_blocking(move || storage_tools::open_database_folder(&path))
        .await
        .map_err(|e| e.to_string())?
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("collection.json");
            let database_path = app.path().app_local_data_dir()?.join("activity.sqlite3");
            app.manage(telemetry::Telemetry::with_database(path, database_path)?);
            app.manage(audio::Monitor::new()?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            application_icon,
            category_configuration,
            open_category_folder,
            developer_environment,
            windows_update_policy,
            open_system_shortcut,
            audio_status,
            media_sessions,
            set_audio_monitor,
            open_sound_settings,
            collection_status,
            open_database_folder,
            set_collection_settings,
            system_history,
            timeline_observations,
            set_keep_awake,
            inspect_foreground,
            inspect_file_usage,
            read_display_timeout,
            set_display_timeout,
            display_off
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Tracel desktop client");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<telemetry::Telemetry>().stop();
            app.state::<audio::Monitor>().stop();
        }
    });
}
