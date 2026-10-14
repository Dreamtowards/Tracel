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
async fn display_off(app: tauri::AppHandle) -> Result<(), String> {
    if !app.state::<telemetry::Telemetry>().can_turn_off_display() {
        return Err("Turn off Keep awake before switching off the display.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        if !app.state::<telemetry::Telemetry>().can_turn_off_display() {
            return Err("Display-off cancelled because Keep awake was enabled.".into());
        }
        tools::turn_off_display()
    })
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
