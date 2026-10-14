# Data model

## Current UI/demo

packages/timeline/src/model.ts preserves Capture, application, foreground/context, AFK, background lifetime, system samples, playback and events. Capture.epoch anchors seconds relative to that epoch. Demo data covers October 8–14, 2026 at a 30-second sample period. Existing date labels remain demo-specific.

Ranges are half-open [start,end); analytics clip to selection. AFK can overlap foreground. Background lifetime means running, not measured CPU work. Null samples mean missing, zero means observed zero. UI units are CPU/GPU/audio percent, RAM GB, and network/disk MB/s; sample-and-hold throughput is integrated to MB. Audio signal and media playback metadata are separate.

## Native foundation

tracel-core uses UTC Unix milliseconds, System/Process/Application/Device subjects, typed metrics, source and quality. Memory uses bytes; network/disk hold bytes measured over each interval. A future adapter converts (native_timestamp_ms - epoch_ms) / 1000 and units, including bytes per interval to UI MB/s. It must retain gaps and sample coverage. These are compatible semantics, not a serialized copy of UI Capture.

tracel-query currently aggregates gauges from non-overlapping observations per subject/metric. It clips weights and excludes missing/non-finite values; zero remains valid. Byte totals and LOD are deferred. The draft system_samples schema records interval, metric, nullable value, source and quality; it is not automatically applied and no database is opened.

## Desktop measured observations

Desktop 0.2 serializes `SystemObservation` from `tracel-agent` as `capturedAtMs` (UTC Unix milliseconds), nullable `cpuPercent`, nullable `memoryUsedBytes` / `memoryTotalBytes` (bytes), and an `errors` array. CPU is a utilization gauge averaged between consecutive counter reads; RAM is an instantaneous physical-memory gauge. Disabled, failed and warm-up values stay null rather than becoming zero. The nominal period is 2,000 ms; timestamps carry actual observation spacing. It is a small collector transport DTO, not yet the interval/quality database model in tracel-core.

System metrics renders and exports this bounded native series separately from the demo Capture. Charts break across missing readings and gaps over six seconds; they do not interpolate interrupted collection. No GPU/network/disk/audio or simulated foreground intervals are inserted into real measurements. The current ring is bounded by 1,800 observations and has no persistent telemetry storage.

## Future entities

Application, process instance and window instance IDs must be distinct and durable; PID/HWND are reusable. Foreground, context, AFK, lifetime and playback remain separate intervals. Discrete switches, sleep/wake, interruptions and rollups should retain source/quality, min/max, time-weighted means, coverage and byte totals. Per-process metrics are deferred and may use separate tables. System is not an application. Process I/O is not physical disk throughput; CPU utilization is not power draw.
