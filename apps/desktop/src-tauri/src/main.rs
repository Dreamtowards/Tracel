#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
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
fn display_off() -> Result<(), String> {
    // Keep old IPC callers harmless too. No timers, broadcasts, or power changes.
    Err("Display-off is disabled after a wake-up reliability issue.".into())
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

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("collection.json");
            app.manage(telemetry::Telemetry::new(path)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            collection_status,
            set_collection_settings,
            system_history,
            set_keep_awake,
            inspect_foreground,
            display_off
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Tracel desktop client");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<telemetry::Telemetry>().stop();
        }
    });
}
