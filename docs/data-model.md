# Data model

## Range history display projection

Native Desktop history now uses a stable Unix epoch coordinate system and an archive-wide axis, with hour-block queries that may span multiple local dates. Source UTC timestamps, database tables and retention are unchanged. `query_timeline` provides a presentation union of contiguous/overlapping presence for the same process, while the existing raw query retains writer-session boundaries.

Wide display captures have `detailLevel: "aggregate"`. Their metric samples contain weighted means with optional per-key `coverage` (covered seconds) and `extrema` (observed min/max); empty bins/keys remain absent, and zero remains observed. These fields describe display bins, not fabricated raw samples. State cells contain a representative observed state and are explicitly labelled coarse. Exact range analytics are calculated on original records before reduction, not inferred from partially selected coarse bins. Narrowing the viewport requests original intervals. Exported wide display samples retain their aggregation metadata/source label and exact matching statistics; they are not a raw-archive export. An incomplete range cannot be exported. The separate monthly overview returns daily foreground/AFK-excluded active milliseconds and numeric sample counts without window titles.

The UI labels `Capture.background` as Apps (应用). It represents observed desktop application presence regardless of foreground focus; foreground intervals never subtract from these lifetimes. Expanded rows use compact 16px defaults and thin continuous bars. Hover resolves only the application's containing presence interval, including duration and start/end times, and stays empty across unobserved gaps. Existing archive/JSON field names remain unchanged. Presence still does not imply exact process start/exit or background CPU work.

## Current UI/demo

packages/timeline/src/model.ts preserves Capture, application, foreground/context, AFK, background lifetime, system samples, playback and events. Capture.epoch anchors seconds relative to that epoch. Demo data covers October 8–14, 2026 at a 30-second sample period. Existing date labels remain demo-specific.

Ranges are half-open [start,end); analytics clip to selection. AFK can overlap foreground. Background lifetime means running, not measured CPU work. Null samples mean missing, zero means observed zero. UI units are CPU/GPU/audio percent, RAM GB, and network/disk MB/s; sample-and-hold throughput is integrated to MB. Audio signal and media playback metadata are separate.

## Native foundation

tracel-core uses UTC Unix milliseconds, System/Process/Application/Device subjects, typed metrics, source and quality. The generic interval model supports memory bytes and byte totals. The current collector DTO instead stores network/disk rates in bytes per second. The Desktop adapter converts (native_timestamp_ms - epoch_ms) / 1000 and binary units (GiB and MiB/s), retaining intervals, gaps and per-metric coverage. These are compatible semantics, not a serialized copy of UI Capture.

tracel-query currently aggregates gauges from non-overlapping observations per subject/metric. It clips weights and excludes missing/non-finite values; zero remains valid. Byte totals and LOD are deferred. Migration 4 replaces the unused migration-1 reservation with typed system_samples and normalized state interval tables. SQLite user_version applies migrations transactionally. Newer unknown schema versions are rejected without overwriting their data.

## Desktop measured observations

Desktop 0.2 serializes `SystemObservation` from `tracel-core` (re-exported by `tracel-agent`) as `capturedAtMs` (UTC Unix milliseconds), nullable `cpuPercent`, nullable `memoryUsedBytes` / `memoryTotalBytes` (bytes), and an `errors` array. CPU is a utilization gauge averaged between consecutive counter reads; RAM is an instantaneous physical-memory gauge. Disabled, failed and warm-up values stay null rather than becoming zero. The nominal period is 2,000 ms; timestamps carry actual observation spacing. `intervalStartMs` identifies the preceding measured interval, or is null after resets/warm-up. The DTO is persisted without inventing source values.

System metrics renders and exports the latest 1,800 observations. Native Timeline queries persisted days and constructs an epoch-relative Capture with explicit end times, nullable values per metric, and real date labels; Web/browser preview retain the demo Capture. Charts break across missing readings and gaps over six seconds; they do not interpolate interrupted collection. Only measured GPU values are inserted; no simulated readings or activity intervals are inserted into real measurements. CPU/network/disk apply to [intervalStartMs,capturedAtMs). RAM/audio/media are sample-and-hold estimates, ending at the next continuous sample or at most two seconds after the last isolated sample. Missing periods are never bridged. Media intervals merge only adjacent identical title/artist/application/status snapshots, so displayed playback duration is an estimate, not a player-reported listening log. Weighted analytics and throughput integrals use each metric's covered time; zero and missing remain distinct.

## Identity and future work

Application, process instance and window instance IDs must be distinct and durable; PID/HWND are reusable. Foreground, context, AFK, lifetime and playback remain separate intervals. Discrete switches, sleep/wake, interruptions and rollups should retain source/quality, min/max, time-weighted means, coverage and byte totals. Per-process metrics are deferred and may use separate tables. System is not an application. Process I/O is not physical disk throughput; CPU utilization is not power draw.

Native observations additionally carry nullable `networkReceiveBytesPerSecond` / `networkSendBytesPerSecond` and `diskReadBytesPerSecond` / `diskWriteBytesPerSecond` (bytes per second), nullable `audioPeakPercent` (0–100 sampled output peak amplitude), and nullable `media` (`title`, `artist`, `application`, `playbackStatus`). Network rates use actual monotonic spacing and physical-interface byte deltas; PDH provides physical-disk rates. These are rates, not accumulated byte totals. Warm-up/disabled/failed measurements remain null; a genuine zero remains zero. Audio is a momentary endpoint-meter reading, not a period average. SMTC metadata is an observed snapshot converted into estimated intervals; absence and failures are distinguished using errors. JSON exports retain units, raw metadata and missing values.

## SQLite archive, schema 4

`activity.sqlite3` remains in Tauri app_local_data_dir. WAL, FULL synchronization and foreign keys are enabled. One append batch atomically commits metrics, normalized metadata and interval changes. No server or new dependency is introduced. Timeline queries run on separate read-only connections in a single consistent read transaction.

| Table | Purpose |
| --- | --- |
| system_samples | UTC observation/interval timestamps, nullable numeric metrics, errors, idle milliseconds and observed-source flags |
| applications | Executable identity/path; pathless observations use process identity |
| process_instances | Application reference, collector process-creation identity, PID and name |
| windows | Process instance and observed HWND |
| strings | Unique title, artist and media-source text |
| media_items | Title/artist/source references, shared across playback visits |
| app_presence_intervals | Each observed process instance's desktop-app presence |
| foreground_intervals | Focused window intervals, independent of title changes |
| window_title_intervals | Observed foreground title changes; unchanged text is reused |
| media_intervals | Media-item reference and playback status over time |
| idle_intervals | Observed AFK support after five minutes without input |

All state ranges use half-open UTC milliseconds `[start_ms,end_ms)`, an estimated quality marker and first/last sample IDs. An unchanged state extends its existing end rather than repeating its metadata per sample. A change creates an interval; recurring titles and media reuse entity IDs. Continuous support requires the collector's interval start to match the preceding sample, positive spacing of at most six seconds and the same writer session. Gaps, missing states and writer restarts break continuity. An isolated or final observation supports at most two seconds. Boundaries remain sampling estimates, not exact process-launch, focus or playback events.

Process instances are collected identities, not separate UI tracks. Apps combines overlapping/adjacent instances of the same executable for display, including time spent in the foreground. It measures observed desktop windows, not all running processes. PID reuse is distinguished by creation identity. HWND reuse within a process is not yet tracked as a distinct window lifetime. Only existing foreground titles are collected; this schema does not add background-window title collection.

Numeric CPU/RAM/network/disk/audio samples retain their measured cadence, including zero; missing values remain null. No delta threshold or lossy compression is applied. Errors still use JSON, but media/window/application snapshots no longer repeat in numeric rows. Rollups, retention, exact lifecycle events and per-process metrics remain deferred.

Queries return incremental numeric rows using row-ID cursors and a complete bounded interval set for the requested local day on every poll. Returning the interval set independently of the numeric cursor ensures that extending an existing tail is visible. Timestamp/overlap and interval-tail indexes support reads and writes. Queries reject more than 50,000 numeric observations or 50,000 state intervals instead of silently truncating. The Desktop adapter clips ranges to the day and selection. Cross-day LOD is deferred; no universal performance improvement is claimed.

Migration 4 streams legacy observations in ID order inside one transaction, preserving numeric values, Unicode metadata and row IDs while constructing intervals. Legacy observations/activity_values tables are removed only if conversion succeeds; failure rolls back the migration. Existing history is not discarded. Large archives can take longer on first startup. The database file may retain reusable free pages after migration; no automatic VACUUM or deletion is performed. Older application versions cannot read schema 4.

`archived_observations` is a reconstruction view, used only to restore the latest 1,800 full observations into the metrics memory ring at startup. It is not another copy of the stored data, and Timeline does not read reconstructed per-sample JSON. Failed writes are reported and remain only in the bounded memory ring; there is no retrospective retry. The CLI one-shot sampler does not persist this archive. Browser/Web previews continue to use demo data.

## Hardware observations, schema 5

Nullable `cpuFrequencyMhz`, `gpus` and `battery` are backward-compatible additions to SystemObservation. Schema 5 adds `cpu_frequency_mhz`, `gpus_json` and `battery_json` to system_samples and updates the recent-ring reconstruction view. Existing rows remain NULL; the migration is transactional and preserves IDs, numeric history and all state intervals. JSON holds the variable per-adapter/per-engine array and the small nullable power-state snapshot; it does not reintroduce application/window metadata snapshots.

Each GPU has adapter/physical identity, a display name, nullable overall utilization percentage, physical engine ID/name/utilization entries, and nullable dedicated/shared used bytes. Source is Windows PDH GPU Engine and GPU Adapter Memory; display names are DXGI metadata. LUID identities are session-specific; a reboot can yield separate historical adapter identities. Overall is the maximum physical-engine utilization after summing process contributions per engine, never an engine or adapter sum. The Timeline's overall GPU analytics summary uses the maximum observed adapter utilization; per-adapter tracks/analytics/export retain their separate values. Missing engines are absent, never padded with zeros.

GPU utilization and engines cover the preceding confirmed sample interval. GPU memory, frequency, battery percentage and power flags use the existing bounded sample-and-hold support. GPU memory is converted to GiB and frequency to GHz only in the UI. Battery presence, percentage, pluggedIn and charging are independently nullable; absent batteries have no invented charge level. The Timeline maps known booleans to 0/1 for plotting, labels hover as Yes/No and retains null gaps. CPU frequency is the arithmetic mean Windows-reported logical-processor MHz, not an effective-clock measurement. Independent collection switches default off for old preferences; disabling a source skips its OS query.

## Microphone observation, schema 6

`audioInputPeakPercent` is a nullable 0–100 default-capture-endpoint peak meter reading, separate from existing output `audioPeakPercent`. Schema 6 adds a nullable `audio_input_peak` REAL column and extends the recent-ring view and bounded numeric query without rewriting previous values or intervals. Old rows deserialize as missing. Input follows the same capped sample-and-hold support as output audio; zero is valid, null breaks coverage. Shared Capture uses `audioInput` as the metric key and percent as the unit. Exported measurements retain the original nullable percent field, while range exports contain clipped support and weighted input analytics.

## GPU display identity normalization

Desktop's view adapter compares GPU IDs case-insensitively and uses the canonical lowercase ID for metric keys. Existing archive JSON and raw exports remain unchanged. Resolved names replace historical fallback labels for the same identity within the loaded data; no schema migration or cross-session identity merging is performed. Missing names use short GPU-number display labels.

## GPU display preferences

Desktop defaults to simplified GPU names (remove GeForce and a trailing Graphics/GPU, preserving manufacturer/model/Laptop) and hides adapters named Microsoft Basic Render Driver. Both preferences persist with appearance settings and are accessible under GPU display in the track-header context menu. They never change collection switches, archived names/measurements or raw exports. Filtering uses resolved full names per canonical identity across the loaded range, including older fallback-only rows, and applies to Timeline tracks, range analytics and System metrics cards. The overall displayed GPU summary excludes hidden adapters; enabling the software-adapter option restores them. Unresolved and other adapter names are retained rather than assuming they are software. Memory subtitles contain only the selected display name; axes/hover/export still carry GiB. Web/demo and native collector APIs are unchanged.
