# Data model

## Current UI/demo

packages/timeline/src/model.ts preserves Capture, application, foreground/context, AFK, background lifetime, system samples, playback and events. Capture.epoch anchors seconds relative to that epoch. Demo data covers October 8–14, 2026 at a 30-second sample period. Existing date labels remain demo-specific.

Ranges are half-open [start,end); analytics clip to selection. AFK can overlap foreground. Background lifetime means running, not measured CPU work. Null samples mean missing, zero means observed zero. UI units are CPU/GPU/audio percent, RAM GB, and network/disk MB/s; sample-and-hold throughput is integrated to MB. Audio signal and media playback metadata are separate.

## Native foundation

tracel-core uses UTC Unix milliseconds, System/Process/Application/Device subjects, typed metrics, source and quality. Memory uses bytes; network/disk hold bytes measured over each interval. A future adapter converts (native_timestamp_ms - epoch_ms) / 1000 and units, including bytes per interval to UI MB/s. It must retain gaps and sample coverage. These are compatible semantics, not a serialized copy of UI Capture.

tracel-query currently aggregates gauges from non-overlapping observations per subject/metric. It clips weights and excludes missing/non-finite values; zero remains valid. Byte totals and LOD are deferred. The draft system_samples schema records interval, metric, nullable value, source and quality; it is not automatically applied and no database is opened.

## Future entities

Application, process instance and window instance IDs must be distinct and durable; PID/HWND are reusable. Foreground, context, AFK, lifetime and playback remain separate intervals. Discrete switches, sleep/wake, interruptions and rollups should retain source/quality, min/max, time-weighted means, coverage and byte totals. Per-process metrics are deferred and may use separate tables. System is not an application. Process I/O is not physical disk throughput; CPU utilization is not power draw.
