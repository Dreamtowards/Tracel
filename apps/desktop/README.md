# Tracel Activity desktop 0.2

Windows-first Tauri 2 client with opt-in real CPU/RAM collection, Settings and native tools. The original October 8–14, 2026 Timeline remains a separate demo; System metrics shows measured data only.

## Run and build

From the repository root:

```sh
npm ci
npm run dev:desktop:ui       # Browser preview; native collection/tools disabled
npm run dev:desktop          # Native Windows client
npm run build:desktop:native # Release executable and per-user NSIS setup
cargo run -p tracel-agent -- --sample     # One CPU/RAM reading
cargo run -p tracel-agent -- --foreground # One foreground window snapshot
```

Native prerequisites: Rust MSVC, C++ Build Tools/Windows SDK and WebView2. Tauri downloads NSIS tools on the first installer build. Outputs:

- target/release/tracel-desktop.exe: standalone executable; WebView2 required.
- target/release/bundle/nsis/Tracel Activity_0.2.0_x64-setup.exe: per-user unsigned Windows development installer. Tauri's default WebView2 bootstrapper handles a missing runtime.

## Collection and Settings

Use the left rail to switch between Timeline, System metrics and Settings. First launch defaults to collection off. Master, CPU and RAM choices are saved locally; disabling a source skips its native query entirely. When collection is off, the worker waits without querying metrics. GPU is visibly unsupported and not queried.

Measurements run every two seconds. CPU needs two counter reads; its first value is missing. The latest 1,800 observations (about one continuous hour) stay in memory until client exit. System metrics displays recent charts and exports actual readings as JSON with UTC millisecond timestamps, percentages, bytes and nulls for missing values. No persistent telemetry database, per-process sampling or independent background service exists. Reopening restores collection preferences; closing stops collection.

Keep screen and computer awake uses a Windows thread power request while the client runs. It resets off on restart and releases on exit, without changing power plans. Turn display off is a one-shot button with a three-second delay, disabled while Keep awake is active. Windows handles normal input wake; later idle sleep policy still applies. See docs/collectors.md for native APIs and limitations.

Foreground diagnostics waits three seconds to let you switch windows, then reads the current title, executable path, PID and HWND once. Protected/exited processes may lack paths. Browser URL extraction is deferred and clearly marked unavailable. This snapshot stays on the Settings page and is not recorded in metric history.

## Preserved features

- Shared Canvas Timeline with range analytics, zoom/pan, context hover, track expansion/resize and display controls.
- Native JSON export through Save As with success/cancel/error feedback. Cancellation performs no write; filesystem writes are limited to dialog-selected paths.
- Device/platform/version, About dialog with Escape, loading retry and render recovery.
- Window position/size/maximized state saved via Tauri's window-state plugin.

Desktop-specific adapters and pages live in src; lifecycle, worker and power tools in src-tauri. Shared Explorer accepts host page/navigation props without importing Tauri. Browser and Web demo behavior is preserved.

## Verification

Use root typecheck, test, build, check:rust and test:rust commands, then build:desktop:native. Rust tests cover selective queries, CPU missing/reset semantics, settings persistence and actual Windows CPU/RAM sampling with master-off suspension. Browser IPC regression covers independent switches, failed-save rollback, power conflicts, diagnostic output, unavailable URLs, live chart/export, demo return and non-native fallback.

Power operations are mocked during browser checks; actual screen-off/keep-awake and native window/save-dialog interaction require manual validation. Building the setup does not install it. Local scripts/screenshots stay in ignored .tracel-runtime.
