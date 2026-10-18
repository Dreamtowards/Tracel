use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

#[derive(Default)]
struct StartupState(AtomicBool);

fn reveal(app: &tauri::AppHandle) -> Result<(), String> {
    // A repeated React effect or watchdog must not steal focus later in the session.
    let state = app.state::<StartupState>();
    if state.0.load(Ordering::Acquire) {
        return Ok(());
    }
    let main = app
        .get_webview_window("main")
        .ok_or("Main window unavailable")?;
    main.show().map_err(|error| error.to_string())?;
    // Focus restrictions should not leave a splash covering an already visible client.
    let _ = main.set_focus();
    if let Some(splash) = app.get_webview_window("splash") {
        splash.close().map_err(|error| error.to_string())?;
    }
    state.0.store(true, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub fn frontend_ready(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the main window can complete startup".into());
    }
    reveal(window.app_handle())
}

pub fn start_watchdog(app: &tauri::AppHandle) {
    app.manage(StartupState::default());
    let app = app.clone();
    std::thread::spawn(move || {
        // A failed frontend must still expose its recovery view / allow normal closing.
        std::thread::sleep(std::time::Duration::from_secs(12));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Err(error) = reveal(&handle) {
                eprintln!("Could not finish startup: {error}");
            }
        });
    });
}
