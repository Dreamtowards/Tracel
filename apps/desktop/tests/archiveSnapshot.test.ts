import { test } from "node:test";
import assert from "node:assert/strict";
import { retainIntervals } from "../src/archiveSnapshot";
import { recordedCapture, dayRange } from "../src/recordedTimeline";
import type { StateIntervals, StoredObservation } from "../src/native";

test("empty polling reuses interval snapshots but changed tails, metadata and removal are retained", () => {
  const original: StateIntervals = { apps: [], foreground: [], media: [
    { id: 1, startMs: 1000, endMs: 2000, value: { title: "Song", artist: "Artist", application: "Player", playbackStatus: "Playing" } },
  ], idle: [] };
  assert.equal(retainIntervals(original, structuredClone(original)), original);
  for (const mutate of [
    (next: StateIntervals) => { next.media[0].endMs = 4000; },
    (next: StateIntervals) => { next.media[0].value.title = "Other song"; },
    (next: StateIntervals) => { next.media = []; },
  ]) {
    const next = structuredClone(original); mutate(next);
    assert.equal(retainIntervals(original, next), next);
  }
  assert.equal(retainIntervals(original, undefined), undefined);
  assert.equal(retainIntervals(undefined, original), original);
});

test("a no-new-sample clock refresh completes the last gauge support without extending across a gap", () => {
  const day = "2026-10-18", time = dayRange(day).startMs + 10000;
  const rows: StoredObservation[] = [{ id: 1, sample: { capturedAtMs: time, intervalStartMs: null, cpuPercent: null,
    memoryUsedBytes: 8 * 1024 ** 3, memoryTotalBytes: 32 * 1024 ** 3, networkReceiveBytesPerSecond: null,
    networkSendBytesPerSecond: null, diskReadBytesPerSecond: null, diskWriteBytesPerSecond: null,
    audioPeakPercent: null, media: null, errors: [] } }];
  assert.equal(recordedCapture(day, rows, time + 500).metrics[0].end, 10.5);
  const complete = recordedCapture(day, rows, time + 2000);
  assert.equal(complete.metrics[0].end, 12);
  assert.deepEqual(recordedCapture(day, rows, time + 10000).metrics, complete.metrics);
});
