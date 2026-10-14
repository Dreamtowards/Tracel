# Tracel Activity desktop 0.1

A Windows-first Tauri 2 client for the shared Activity Timeline. This release uses the deterministic October 8–14, 2026 demo capture; it does not collect device activity or metrics, open a telemetry database, or run an agent.

## Run and build

From the repository root:

```sh
npm ci
npm run dev:desktop:ui       # Browser preview, ordinary browser downloads
npm run dev:desktop          # Native window with system save dialog
npm run build:desktop:native # Release executable and per-user NSIS setup
```

Native prerequisites: Rust MSVC, C++ Build Tools/Windows SDK and WebView2. Tauri downloads NSIS tools on the first installer build. Outputs:

- `target/release/tracel-desktop.exe`: standalone executable; WebView2 is required.
- `target/release/bundle/nsis/Tracel Activity_0.1.0_x64-setup.exe`: per-user Windows installer. Tauri's default WebView2 bootstrapper handles a missing runtime. This is an unsigned development release.

## Features

- Original shared Canvas Timeline, range selection/analytics, zoom/pan, context hover, track expansion/resize and display controls.
- Native JSON export through Save As, with success/cancel status and recoverable error feedback. Cancellation performs no write. Filesystem write access is limited to paths selected by the save dialog, without broad directory permissions.
- Native device name/platform/version in the client. The capture is still simulated; device information does not imply telemetry collection.
- About client dialog documenting the demo scope; keyboard Escape closes it and browser dialog focus behavior is retained.
- Window position/size/maximized state saved locally through Tauri's window-state plugin.
- Capture loading retry and render-error recovery. Closing the window exits the client; there is no background tracking.

Desktop-specific bindings live in `src/native.ts` and `src/App.tsx`. Shared UI accepts optional host metadata/actions/export callback and imports no Tauri APIs. Browser/Web downloads remain functional. Do not add native imports to packages/timeline.

## Verification

Root TypeScript checks, existing Radar/Activity tests, three Desktop IPC export tests, Web and Desktop production builds, Cargo workspace checks/tests, and Tauri Windows executable/NSIS installer build passed. Browser checks verified About/Escape, demo rendering and JSON export; mocked native IPC checks verified device metadata, save/cancel/error/retry.

Actual Windows window/save-dialog interaction was not verified: Computer Use app approval timed out. Building the installer does not mean it was installed. Local verification scripts and screenshots remain in ignored `.tracel-runtime`.
