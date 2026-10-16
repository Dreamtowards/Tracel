# Tracel Activity desktop 0.2.11

0.2.11 uses the website timeline mark as its native EXE/window icon and shares all five page presentations with the online demo. Browser-unsupported controls are disabled; native collection, diagnostics and tools remain host-owned through an explicit platform adapter. The new EXE is saved under `target/portable/Tracel-0.2.11-windows-x64/Tracel.exe`; earlier versioned files are kept. Branding source: `assets/branding/tracel.svg`; regenerate favicon/native assets with `npm run icons:generate`.

0.2.9 adds editable hierarchical categories (`categories.json`, snake_case keys), 169 default executable rules, category share bars and cached native application icons. Configuration details: [categories](../../docs/categories.md). Icon PNGs live beside the SQLite archive in `icon-cache`; no installation or bundled icon pack is required.

Windows-first Tauri 2 client with opt-in real CPU/RAM/network/disk/audio/media collection, Settings and native tools. Native Timeline displays persisted system observations and estimated media intervals. Browser preview and Web retain the original October 8–14, 2026 demo; System metrics shows measured data only.

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

- target/release/tracel-desktop.exe: current build output; WebView2 required. Versioned release copy: target/portable/Tracel-0.2.11-windows-x64/Tracel.exe.
- Optional build:desktop:portable output, target/portable/Tracel-0.2.11-windows-x64.zip: extract and double-click Tracel.exe; no installer. WebView2 must already be present. Preferences/window placement and the SQLite archive still use the Windows user application-data directory, so this is installation-free rather than a self-contained data directory.
- Existing 0.2.0 NSIS installer artifacts and installer configuration are retained, but that version contains the reported display-off problem and should not be used. Default builds do not invoke NSIS.

## Collection and Settings

Right-click the Timeline label column (TRACKS, group headers or individual track headers), or focus it and press Shift+F10, to configure collection. The shadcn-style Radix Context Menu contains the master switch and all activity, system and audio sources. Settings links to this menu rather than duplicating source switches. Saved history stays visible when a source is disabled; changes only affect future observations. The menu preserves confirmed values on failed saves and bounds its portal to the viewport at every interface scale.


Desktop uses a viewport-sized shell: only the right content pane scrolls, while the left navigation stays in place. Expand/collapse reveals page labels; About client lives at the bottom. All pages omit the global header. Timeline opens directly on its toolbar, with export and shortcuts beside the view controls; its overview identifies recorded data in the native client and demo data in browser preview. Settings and metrics use compact groups and neutral colors. Owned Button, Switch, Select, Popover, Calendar and Card components follow the shadcn/ui composition with Desktop CSS tokens: Radix handles switches/selects/popovers and React DayPicker handles calendar navigation, focus and date bounds. The Timeline date-picker render slot keeps these dependencies out of Web and the shared package. Export is an accessible icon button, with shortcuts immediately to its left. The Timeline uses flex layout to fill available height rather than subtracting the old Web header height.

Appearance includes an English / Chinese language selector, persisted locally and applied immediately to navigation, Settings, metrics, dialogs and the Timeline (including calendar dates). The initial language remains English. Switching language preserves the Timeline view and selection, theme and collection state. Application names, window titles, URLs and JSON data retain their source values. Action buttons use borderless ghost/soft secondary variants with keyboard focus rings.

Appearance in Settings controls interface zoom from 75% to 175%, default 110%. Ctrl + plus/equal or numpad plus increases it; Ctrl + minus decreases it; Ctrl + 0 restores 110%. The same Cmd shortcuts work in browser previews. Drag the navigation edge to resize from 160 to 280 logical pixels; small windows cap its width to leave room for content. Arrow keys adjust its focused separator, Home/End use the limits, and double-click restores 192 pixels. Accent color defaults to neutral graphite, with presets and a custom color picker. Its validated hex value drives navigation, switches, selected days, focus indicators, overview and Canvas selections; semantic app/chart series colors remain distinct. These controls use the same theme in body portals, scaled through size tokens so popup positioning remains in viewport coordinates. Language, zoom, accent, preferred navigation width and expansion persist in local webview storage independently of collection preferences. These shortcuts work even when the Timeline canvas has focus; plain plus/minus and the timeline wheel still control time zoom. Canvas hit testing, selection, resizing and backing resolution account for interface scaling.

Use the left rail to switch between Timeline, System metrics, Audio, Utilities and Settings. Utilities contains sleep prevention, Windows AC/DC display timeout editing, and on-demand file usage inspection. First launch defaults to collection off. Master, CPU, RAM, network, disk, audio and media choices are saved locally; disabling a source skips its native query entirely. When collection is off, the worker waits without querying metrics. GPU engines/used memory, battery/power state and Windows-reported CPU frequency have separate opt-in switches (default off for old preferences). GPU and memory tracks are per adapter; expand utilization for physical-engine details. Frequency has a separate GHz row below CPU. No vendor runtime or sensor driver is bundled. Pending saves block repeat mutations using aria-disabled and a guarded handler, while preserving normal control opacity and layout; rejected saves retain the last confirmed native settings.

Measurements run every two seconds. CPU, network and disk need two reads; their first rates are missing. Additional collectors default off and remain off when loading older preferences. Every accepted observation is committed to SQLite. The latest 1,800 observations (about one continuous hour) also stay in memory and are restored from the archive on restart. System metrics displays recent charts and exports actual readings as JSON with UTC millisecond timestamps, percentages, bytes and nulls for missing values. Per-process sampling and an independent background service are not implemented. Reopening restores collection preferences; closing stops collection.

Utilities: Prevent automatic sleep uses a Windows system-activity request while the client runs, allowing normal display timeout. It resets off on restart and releases on exit, without changing power plans. Manual display-off remains unavailable and its native IPC is disabled in 0.2.1 after repeated-blackout/unexpected-sleep reports. Its broadcast and delayed task have been removed; callers cannot schedule another blackout. The precise hardware failure has not been reproduced. See docs/collectors.md for findings and platform limitations.

Foreground diagnostics waits three seconds to let you switch windows, then reads the current title, executable path, PID and HWND once. Protected/exited processes may lack paths. Browser URL extraction is deferred and clearly marked unavailable. This snapshot stays on the Settings page and is not recorded in metric history.

## File usage utility

Choose a single file (or paste its path and press Enter if the file picker rejects an in-use file) in Utilities to query Windows Restart Manager (`RmStartSession`, `RmRegisterResources`, `RmGetList`, `RmEndSession`). Results include application/service name, PID, process creation identity and an executable path when query access is available. Refresh repeats the snapshot; there is no background file watcher. The query never calls shutdown/restart, kills a process or forcibly closes a file handle. Process image lookup validates creation time against Restart Manager to avoid PID reuse.

This is a best-effort list of applications associated with the selected file, not exhaustive kernel-handle enumeration or proof of who blocks deletion. Empty results do not prove a file is unused. Last-modified time is file metadata, not a history of modifying programs. Historical attribution requires prior auditing or event capture and is not implemented. No file contents are read, no new packaged DLL or driver is introduced, and no elevation is automatically requested. The existing Windows bindings link the system `Rstrtmgr.dll`; actual release size changes have not been measured because no release build was requested.

Browser preview shows the page but disables file selection and power controls; the native client is required. Tests query a real temporary file held open by the test process and verify it can be deleted after the handle closes. Browser IPC checks cover cancellation without querying, refresh, empty/error responses, raw process names, Chinese labels and migrated power-state continuity.

## Preserved features

- Shared Canvas Timeline with range analytics, zoom/pan, context hover, track expansion/resize and display controls.
- Native JSON export through Save As with success/cancel/error feedback. Cancellation performs no write; filesystem writes are limited to dialog-selected paths.
- Device/platform/version, About dialog with Escape, loading retry and render recovery.
- Window position/size/maximized state saved via Tauri's window-state plugin.

Desktop-specific adapters and pages live in src; lifecycle, worker and power tools in src-tauri. Shared Explorer accepts host page/navigation props without importing Tauri. Browser and Web demo behavior is preserved.

## Verification

Use root typecheck, test, build, check:rust and test:rust commands, then build:desktop:portable. Rust tests cover selective queries, CPU missing/reset semantics, settings persistence and actual Windows CPU/RAM sampling with master-off suspension. Additional regression tests verify repeated legacy display_off calls are rejected and sleep-prevention flags exclude display activity. Browser IPC regression covers switches, failed-save rollback, zero manual display-off requests, diagnostic output, live chart/export and non-native fallback.

Localization tests cover English fallback, host/shared message lookup and literal interpolation. Browser checks additionally cover live English/Chinese switching, persistence and invalid saved-language fallback, selected range/view preservation, Chinese calendar and dialogs, native-mocked diagnostics/metrics export with unchanged JSON data, and Chinese layouts at 175% zoom.

Browser layout regression additionally verifies fixed navigation during right-pane scrolling, Desktop header/hero removal and preserved Web header, pointer/keyboard navigation resizing, width/expansion persistence, zoom shortcuts/reset, 800x600 at 175%, matching Canvas range selections at 100%/175% zoom, Select/Calendar keyboard and focus behavior, date bounds, scaled popup positioning, accent persistence/reset, delayed-save appearance and footer alignment.

Power operations are mocked during browser checks; no actual black-screen command is tested or shipped in 0.2.1. Native window/save-dialog interaction and hardware sleep behavior have not been validated. Local scripts/screenshots stay in ignored .tracel-runtime.

## Network, disk, audio and media

System metrics adds physical-adapter receive/send rates, physical-disk read/write rates, default audio-output peak amplitude, and current Windows SMTC title/artist/application/playback status. Each source has its own Timeline header context-menu switch and skips native queries when off. Rates display KiB/s or MiB/s; missing values stay missing and zero is shown as zero. JSON export includes these raw readings and units. Media coverage depends on apps publishing SMTC metadata; audio level does not identify media and does not record audio. See docs/collectors.md for adapter, exclusive-audio, sampling and media limitations.

Utilities reads the active plan's plugged-in/battery display timeouts and saves them only after an explicit click. Refresh reloads current Windows values. Save checks for outside changes and attempts rollback if applying fails; policy/access errors are displayed. This edits Windows display settings permanently, including Never, without editing sleep/hibernate timeouts. Prevent automatic sleep remains a separate temporary request. Tests only read actual OS policy; writes/rollback use fakes. No driver or extra runtime is bundled; release-size difference is unmeasured because this update intentionally skips release packaging.

## Recorded Timeline and storage

The native Timeline uses `activity.sqlite3` in Tauri app_local_data_dir (normally `%LOCALAPPDATA%\com.tracel.activity\activity.sqlite3` on Windows). Settings shows its actual path, committed count and storage errors. SQLite is statically bundled through rusqlite, requiring no server, driver or extra database DLL; release size has not been measured for this change. WAL, FULL synchronization and transactional schema migrations protect committed records. Close the client before copying the main database file for a simple manual backup. Archive records currently have no automatic expiration or deletion.

Choose a calendar day, then an hour/day view. Live follows the newest records without changing the current view duration; manual navigation, zooming or selecting stops following, and Live resumes it. Display can toggle the red current-time marker; it appears only when the actual current time is inside the visible range. Native queries are bounded to one local day (including DST) and 50,000 observations, with incremental row-ID cursors. Cross-day/week views and LOD rollups are deferred. CPU, RAM, network, disk, audio and media are real recorded values; uncollected activity and unsupported GPU stay blank. Gaps stay empty. CPU/network/disk summarize the preceding actual interval; RAM/audio and playing/paused media durations use bounded sample-and-hold estimates. Export and analytics clip to the selected range and use per-metric coverage. Binary units are GiB and MiB/s.

The archive preserves existing recorded samples; readings discarded before SQLite collection was introduced cannot be recovered. Database failures are displayed: live recent readings remain available, but failed writes are not retried and Timeline does not replace missing data with demo content. The standalone one-shot CLI does not persist data. Closing the app still stops collection.

Archive verification covers reopen/recovery, atomic rollback, zero/null/Unicode values, cursor/range limits, real collector persistence, exact sampling intervals, midnight clipping, media gaps, full-day datasets, native-mocked date navigation/export/live-follow and unchanged browser demo. Preview-stage validation runs typecheck, unit tests and Rust check/tests without release builds or packaging.

## Windows utilities

Utilities provides automatic-update policy status, **Disable until restored**, and **Restore previous setting**. Changes require running Tracel as administrator on Windows Pro/Enterprise/Education. The official [`NoAutoUpdate` policy](https://learn.microsoft.com/en-us/windows/deployment/update/waas-wu-settings#configuring-automatic-updates-by-editing-the-registry) disables automatic updates, including automatic security updates, while allowing manual updates. This does not cancel already scheduled restarts or prove that another Windows/organization policy cannot override it. Check Windows Update itself for pending updates/restarts. Tracel never stops update services or deletes system tasks.

Only the original `NoAutoUpdate` value is backed up in HKLM `SOFTWARE\Tracel\UpdatePolicy`; restoring leaves all other update settings intact. The backup survives app exit/reinstall, and timestamps show how long a successfully applied Tracel policy has been disabled, not when an external policy started. An externally disabled policy is not claimed or cleared. Conflicting external changes cause an error. Keep this app or the backup until restoring your change. There is no year-based expiry or guaranteed permanent disable: reliable unattended expiry would require additional persistent scheduling. Read-only status and isolated temporary HKCU tests do not change the machine's update settings.

**Developer environments → Scan** lists Java JDK/JRE, Python and modern .NET SDK/runtime versions with paths, using [PEP 514 Python registrations](https://peps.python.org/pep-0514/), Java registry/release metadata, PATH, JAVA_HOME, .NET roots and common install directories. It never executes detected tools and skips remote paths and Windows Store aliases. Unregistered portable versions, virtual environments, .NET Framework and nonstandard installs may be missing; absence is not proof of noninstallation. Scans have directory/result/output/time limits and run only on demand. The environment variables/PATH editor and Windows Update, startup apps, installed apps, storage, Task Manager and Resource Monitor shortcuts open only on click. No new npm/Cargo dependency, bundled interpreter, driver or background service is added; release EXE size has not been measured for these changes.

## Audio page

Open Audio in the native Windows client to start session monitoring. It scans all active outputs, including apps routed to another device, and shows per-session signal level, volume setting, mute state, PID, device and recent signal time/peak. Use All sessions/Recent sounds and the output filter to narrow the list. Recent signals stay for one minute, including ended sessions; this helps identify a brief sound after it stops. Monitoring continues on other pages and while minimized until Pause monitoring or app exit. It is independent of the metrics master switch and does not record audio or write this diagnostic history to SQLite. Pausing freezes results and releases audio interfaces; new app launches start idle.

Default multimedia and communications input/output names appear above the sessions. Windows sound settings opens the system page for changing defaults; direct in-app switching is intentionally deferred because it would require private policy interfaces. Changes refresh automatically during monitoring. Microphones are listed, never opened or recorded. No audio settings are changed without user interaction, and there are no volume/mute writes.

This is a best-effort Core Audio session view, not an exhaustive sound-origin auditor. Session-creation notifications plus cached meters supplement periodic enumeration across all outputs. Very short sounds, exclusive/DRM paths and protected processes may be unavailable; system-sounds and shared sessions cannot always be attributed to an individual program. Meter peaks are signal levels, not proof of audibility. Browser tabs are not individually identified. No extra runtime, driver or new Cargo package is bundled; EXE-size impact has not been measured. Browser preview shows the layout with native actions disabled, without fake application sessions. Read-only native tests and silent-session notification tests pass without playing tones or changing real devices.

Audio also lists Windows SMTC media sessions (playing first, paused separately), including sessions beyond the one Windows selects for its media controls. Metadata refreshes on this page while audio monitoring is enabled; leaving the page/pause stops requests and keeps the cached list. Failures are visible without discarding the last successful scan. This on-demand list is independent of Timeline collection and is not archived. The Timeline still saves one current media session. No new native/runtime dependency is added; applications that do not publish media information remain identifiable through audio signal meters rather than song metadata.

## Schema 4: samples and intervals

Apps (应用) shows observed desktop applications throughout foreground and background use. Its underlying process_instances identify launches by collector creation identity; they are not an extra visible track. Foreground focus, foreground titles, Apps, media status and AFK are persisted as intervals. Repeated state extends end_ms, while applications/processes/windows/media and text are shared references. system_samples retains raw numeric metrics and missing/zero distinctions. Timeline reads these intervals directly; the latest-history ring reconstructs full snapshots only at startup.

Opening a legacy archive performs a transactional schema-4 conversion in the same activity.sqlite3 file. Existing IDs, samples and metadata are retained; invalid history aborts and rolls back rather than resetting the database. Close the client and back up the archive before upgrading; older binaries cannot read schema 4. First startup can take longer for a large archive, and file size need not shrink immediately because SQLite reuses freed pages. There is no automatic pruning, VACUUM, rollup or new bundled database dependency.

To inspect storage after running the native client with collection enabled: open the path shown in Settings using a SQLite viewer and inspect PRAGMA user_version (4), system_samples and the *_intervals tables. If state remains unchanged across many samples, system_samples grows while each active interval's end_ms advances and its row count stays stable. media_items and strings reuse repeated metadata. Browser preview remains demo data and does not create or open the native database.

## EXE release rule

When several commits have accumulated since the previous EXE, increase at least the Desktop patch version before building (unless the user specifies a version). Keep npm, npm lockfile, Cargo, Cargo lockfile and Tauri versions consistent. Preserve earlier versioned artifacts and save each new EXE under target/portable/Tracel-<version>-windows-x64/Tracel.exe; do not overwrite a previous release there. target/release/tracel-desktop.exe is only the current build output. Default to EXE only; ZIP or installers require an explicit request.

Microphone input level is an independent opt-in collection source (off by default). Native Timeline places Audio input immediately above Audio output. Settings, recent metrics, archive and exports retain its sampled peak percentage; no audio is recorded and no capture stream is started. Idle or exclusive microphone usage can report zero. No new runtime or driver is bundled.
