# Tracel Activity desktop 0.2.3

Windows-first Tauri 2 client with opt-in real CPU/RAM collection, Settings and native tools. The original October 8–14, 2026 Timeline remains a separate demo; System metrics shows measured data only.

## Run and build

From the repository root:

```sh
npm ci
npm run dev:desktop:ui       # Browser preview; native collection/tools disabled
npm run dev:desktop          # Native Windows client
npm run build:desktop:native # Release executable; no installer
npm run build:desktop:portable # Executable + extract-and-run ZIP (Windows)
npm run build:desktop:installer # Optional NSIS setup; only build on explicit request
cargo run -p tracel-agent -- --sample     # One CPU/RAM reading
cargo run -p tracel-agent -- --foreground # One foreground window snapshot
```

Native prerequisites: Rust MSVC, C++ Build Tools/Windows SDK and WebView2. Outputs:

- target/release/tracel-desktop.exe: standalone executable; WebView2 required.
- target/portable/Tracel-0.2.3-windows-x64.zip: extract and double-click Tracel.exe; no installer. WebView2 must already be present. Preferences/window placement still use the Windows user application-data directory, so this is installation-free rather than a self-contained data directory.
- Existing 0.2.0 NSIS installer artifacts and installer configuration are retained, but that version contains the reported display-off problem and should not be used. Default builds do not invoke NSIS.

## Collection and Settings

Desktop uses a viewport-sized shell: only the right content pane scrolls, while the left navigation stays in place. Expand/collapse reveals page labels; About client lives at the bottom. All pages omit the global header. Timeline opens directly on its toolbar, with export and shortcuts beside the view controls; its overview identifies demo data. Settings and metrics use compact groups and neutral colors. The owned Switch component uses Radix, following the shadcn component pattern without requiring Tailwind in Desktop.

Appearance in Settings controls interface zoom from 75% to 175%, default 110%. Ctrl + plus/equal or numpad plus increases it; Ctrl + minus decreases it; Ctrl + 0 restores 110%. The same Cmd shortcuts work in browser previews. Drag the navigation edge to resize from 160 to 280 logical pixels; small windows cap its width to leave room for content. Arrow keys adjust its focused separator, Home/End use the limits, and double-click restores 192 pixels. Zoom, preferred navigation width and expansion persist in local webview storage independently of collection preferences. These shortcuts work even when the Timeline canvas has focus; plain plus/minus and the timeline wheel still control time zoom. Canvas hit testing, selection, resizing and backing resolution account for interface scaling.

Use the left rail to switch between Timeline, System metrics and Settings. First launch defaults to collection off. Master, CPU and RAM choices are saved locally; disabling a source skips its native query entirely. When collection is off, the worker waits without querying metrics. GPU is visibly unsupported and not queried.

Measurements run every two seconds. CPU needs two counter reads; its first value is missing. The latest 1,800 observations (about one continuous hour) stay in memory until client exit. System metrics displays recent charts and exports actual readings as JSON with UTC millisecond timestamps, percentages, bytes and nulls for missing values. No persistent telemetry database, per-process sampling or independent background service exists. Reopening restores collection preferences; closing stops collection.

Prevent automatic sleep uses a Windows system-activity request while the client runs, allowing normal display timeout. It resets off on restart and releases on exit, without changing power plans. Manual display-off is disabled in the UI and native IPC in 0.2.1 after repeated-blackout/unexpected-sleep reports. Its broadcast and delayed task have been removed; callers cannot schedule another blackout. The precise hardware failure has not been reproduced. See docs/collectors.md for findings and platform limitations.

Foreground diagnostics waits three seconds to let you switch windows, then reads the current title, executable path, PID and HWND once. Protected/exited processes may lack paths. Browser URL extraction is deferred and clearly marked unavailable. This snapshot stays on the Settings page and is not recorded in metric history.

## Preserved features

- Shared Canvas Timeline with range analytics, zoom/pan, context hover, track expansion/resize and display controls.
- Native JSON export through Save As with success/cancel/error feedback. Cancellation performs no write; filesystem writes are limited to dialog-selected paths.
- Device/platform/version, About dialog with Escape, loading retry and render recovery.
- Window position/size/maximized state saved via Tauri's window-state plugin.

Desktop-specific adapters and pages live in src; lifecycle, worker and power tools in src-tauri. Shared Explorer accepts host page/navigation props without importing Tauri. Browser and Web demo behavior is preserved.

## Verification

Use root typecheck, test, build, check:rust and test:rust commands, then build:desktop:portable. Rust tests cover selective queries, CPU missing/reset semantics, settings persistence and actual Windows CPU/RAM sampling with master-off suspension. Additional regression tests verify repeated legacy display_off calls are rejected and sleep-prevention flags exclude display activity. Browser IPC regression covers switches, failed-save rollback, the permanently disabled display-off button without native requests, diagnostic output, live chart/export and non-native fallback.

Browser layout regression additionally verifies fixed navigation during right-pane scrolling, Desktop header/hero removal and preserved Web header, pointer/keyboard navigation resizing, width/expansion persistence, zoom shortcuts/reset, 800x600 at 175%, and matching Canvas range selections at 100%/175% zoom.

Power operations are mocked during browser checks; no actual black-screen command is tested or shipped in 0.2.1. Native window/save-dialog interaction and hardware sleep behavior have not been validated. Local scripts/screenshots stay in ignored .tracel-runtime.
