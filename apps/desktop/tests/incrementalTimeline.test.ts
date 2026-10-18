import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecordedCaptureBuilder, recordedCapture, dayRange } from "../src/recordedTimeline";
import { analyze } from "@tracel/timeline/analytics";
import { metricSeries } from "@tracel/timeline/metric-index";
import type { StateIntervals, StoredObservation, SystemObservation } from "../src/native";

const day = "2026-10-18", epoch = dayRange(day).startMs;
const empty: StateIntervals = { apps: [], foreground: [], media: [], idle: [] };
const gpu = { id: "A", name: "NVIDIA GeForce RTX 4070 Laptop GPU", utilizationPercent: 50,
  engines: [{ id: "0", name: "3D", utilizationPercent: 50 }], dedicatedUsedBytes: 2 * 1024 ** 3, sharedUsedBytes: 0 };
function row(id: number, time: number, patch: Partial<SystemObservation> = {}): StoredObservation {
  return { id, sample: { capturedAtMs: epoch + time * 1000, intervalStartMs: null, cpuPercent: id % 100,
    memoryUsedBytes: 8 * 1024 ** 3, memoryTotalBytes: 32 * 1024 ** 3,
    networkReceiveBytesPerSecond: id * 1024, networkSendBytesPerSecond: 0,
    diskReadBytesPerSecond: 0, diskWriteBytesPerSecond: null, audioPeakPercent: 0, audioInputPeakPercent: null,
    gpus: [gpu], cpuFrequencyMhz: 3200, battery: { present: true, percent: 80, pluggedIn: true, charging: false },
    media: null, errors: [], ...patch } };
}

test("incremental samples and indexed analytics match full conversion through continuous, paused and missing readings", () => {
  const build = createRecordedCaptureBuilder();
  let rows = [row(1, 10)], now = epoch + 11000;
  let previous = build(day, rows, now, empty);
  for (let i = 2; i <= 70; i++) {
    const before = structuredClone(previous);
    const oldStats = analyze(previous, { start: 0, end: 86400 });
    metricSeries(previous);
    const time = (rows.at(-1)!.sample.capturedAtMs - epoch) / 1000 + (i % 11 === 0 ? 20 : i % 7 === 0 ? 4 : 2);
    rows = rows.concat(row(i, time, { intervalStartMs: i % 11 === 0 ? null : rows.at(-1)!.sample.capturedAtMs,
      cpuPercent: i % 5 === 0 ? null : i % 100, memoryUsedBytes: i % 6 === 0 ? null : 8 * 1024 ** 3,
      gpus: i % 4 === 0 ? null : [{ ...gpu, utilizationPercent: i % 100, dedicatedUsedBytes: (i % 9) * 1024 ** 3 }],
      audioInputPeakPercent: i % 3 === 0 ? 0 : null }));
    now = epoch + (time + .5) * 1000;
    const next = build(day, rows, now, empty), full = recordedCapture(day, rows, now, empty);
    assert.deepEqual(next, full);
    assert.deepEqual(analyze(next, { start: time - 13, end: time + 1 }), analyze(full, { start: time - 13, end: time + 1 }));
    assert.deepEqual(previous, before, "previous snapshots cannot be mutated by tail replacement");
    assert.deepEqual(analyze(previous, { start: 0, end: 86400 }), oldStats, "previous indexes cannot change");
    if (previous.metrics.length > 4) assert.equal(next.metrics[0], previous.metrics[0], "historical sample objects are reused");
    previous = next;
    const capped = build(day, rows, epoch + (time + 2) * 1000, empty);
    assert.deepEqual(capped, recordedCapture(day, rows, epoch + (time + 2) * 1000, empty));
    previous = capped;
  }
});

test("interval-only updates, changed GPU inventory/preferences and out-of-order rows remain equivalent to a full rebuild", () => {
  const build = createRecordedCaptureBuilder();
  const rows = [row(1, 10), row(2, 12, { intervalStartMs: epoch + 10000 })];
  const now = epoch + 100000;
  build(day, rows, now, empty);
  const process = { instanceId: "one", processId: 1, name: "Editor", executable: "C:\\Editor.exe" };
  const states: StateIntervals = { ...empty,
    apps: [{ id: 1, startMs: epoch + 10000, endMs: epoch + 18000, value: process }],
    foreground: [{ id: 2, startMs: epoch + 10000, endMs: epoch + 15000, value: { process, title: "Document", windowId: "1" } }],
    media: [{ id: 3, startMs: epoch + 12000, endMs: epoch + 18000, value: { application: "Player", title: "Song", artist: "Artist", playbackStatus: "Paused" } }] };
  assert.deepEqual(build(day, rows, now, states), recordedCapture(day, rows, now, states));
  const grown = structuredClone(states); grown.apps[0].endMs += 2000;
  assert.deepEqual(build(day, rows, now, grown), recordedCapture(day, rows, now, grown));
  const topology = rows.concat(row(3, 14, { gpus: [{ ...gpu, engines: [...gpu.engines, { id: "1", name: "Compute", utilizationPercent: 0 }] }] }));
  assert.deepEqual(build(day, topology, now, grown), recordedCapture(day, topology, now, grown));
  for (const options of [{ simplifyGpuNames: false }, { showSoftwareGpus: true }])
    assert.deepEqual(build(day, topology, now, grown, options), recordedCapture(day, topology, now, grown, options));
  const backwards = topology.concat(row(4, 11));
  assert.deepEqual(build(day, backwards, now, grown), recordedCapture(day, backwards, now, grown));
  const duplicate = backwards.concat(row(5, 11));
  assert.deepEqual(build(day, duplicate, now, grown), recordedCapture(day, duplicate, now, grown));
  assert.deepEqual(build("2026-10-19", duplicate, now, empty), recordedCapture("2026-10-19", duplicate, now, empty));
});

test("incremental fallback GPU names use full-history resolution and never reveal hidden software adapters", () => {
  const build = createRecordedCaptureBuilder(), now = epoch + 100000;
  let rows = [row(1, 10, { gpus: [{ ...gpu, name: "GPU 1" }, { ...gpu, id: "S", name: "GPU 2" }] }),
    row(2, 12, { gpus: [gpu, { ...gpu, id: "S", name: "Microsoft Basic Render Driver" }] })];
  const first = build(day, rows, now, empty); metricSeries(first);
  rows = rows.concat(row(3, 14, { intervalStartMs: epoch + 12000, gpus: [{ ...gpu, name: "GPU 1" }, { ...gpu, id: "S", name: "GPU 2" }] }));
  const next = build(day, rows, now, empty);
  assert.deepEqual(next, recordedCapture(day, rows, now, empty));
  assert.ok(!next.metrics.some(sample => Object.keys(sample.values ?? {}).some(key => key.startsWith("gpu:s:"))));
});

test("known GPU and engine names changing back still refresh historical display metadata; batched samples reuse the fast path", () => {
  const build = createRecordedCaptureBuilder(), now = epoch + 100000;
  let rows = [row(1, 10)];
  build(day, rows, now, empty);
  const renamed = { ...gpu, name: "NVIDIA RTX renamed", engines: [{ ...gpu.engines[0], name: "Renamed engine" }] };
  rows = rows.concat(row(2, 12, { gpus: [renamed] }));
  assert.deepEqual(build(day, rows, now, empty), recordedCapture(day, rows, now, empty));
  rows = rows.concat(row(3, 14));
  const reverted = build(day, rows, now, empty); metricSeries(reverted);
  assert.deepEqual(reverted, recordedCapture(day, rows, now, empty));
  rows = rows.concat(row(4, 16, { intervalStartMs: epoch + 14000 }), row(5, 18, { intervalStartMs: epoch + 16000 }));
  const batch = build(day, rows, now, empty);
  assert.deepEqual(batch, recordedCapture(day, rows, now, empty));
  assert.equal(batch.metrics[0], reverted.metrics[0]);
});
