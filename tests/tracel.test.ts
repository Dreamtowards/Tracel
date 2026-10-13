import { test } from "node:test";
import assert from "node:assert/strict";
import { createCapture } from "../src/tracel/data";
import { analyze } from "../src/tracel/analytics";
import { DAY, clampRange, zoomRange } from "../src/tracel/model";

const data = createCapture();
const at = (hour: number) => 6 * DAY + hour * 3600;

test("capture is deterministic and contains seven days with correlated workloads", () => {
  assert.deepEqual(data, createCapture());
  assert.equal(data.metrics.length, (7 * DAY) / 30);
  const compile = analyze(data, { start: at(11.1), end: at(11.3) });
  const editing = analyze(data, { start: at(9.2), end: at(9.4) });
  assert.ok(compile.metrics.cpu.average! > editing.metrics.cpu.average! + 40);
  assert.ok(compile.metrics.read.average! > editing.metrics.read.average! + 50);
});

test("foreground and AFK are clipped to selection rather than full events", () => {
  const stats = analyze(data, { start: at(12), end: at(12.5) });
  assert.ok(Math.abs(stats.foreground - 1800) < 1e-6);
  assert.ok(Math.abs(stats.afk - 1260) < 1e-6);
  assert.ok(Math.abs(stats.active - 540) < 1e-6);
  assert.equal(stats.switches, 1);
  assert.equal(
    stats.apps.reduce((sum, a) => sum + a.active, 0),
    stats.active,
  );
});

test("partial metric samples use time weighting and integrate throughput", () => {
  const start = at(14.3) + 5;
  const stats = analyze(data, { start, end: start + 10 });
  const sample = data.metrics[Math.floor(start / data.samplePeriod)];
  assert.ok(
    Math.abs(stats.metrics.download.total - sample.values!.download * 10) <
      1e-6,
  );
  assert.equal(stats.metrics.download.coverage, 10);
  assert.equal(stats.metrics.download.average, sample.values!.download);
});

test("zero audio is observed data, sleep and capture gaps are missing data", () => {
  const silent = analyze(data, { start: at(9), end: at(9.1) });
  assert.equal(silent.metrics.audio.average, 0);
  assert.ok(silent.metrics.audio.coverage > 0);
  const asleep = analyze(data, { start: at(20), end: at(21) });
  assert.equal(asleep.metrics.cpu.average, null);
  assert.equal(asleep.metrics.cpu.peak, null);
  assert.equal(asleep.metrics.cpu.coverage, 0);
  assert.equal(asleep.foreground, 0);
});

test("media is clipped and app switches at range boundaries are excluded", () => {
  const stats = analyze(data, { start: at(9.3), end: at(9.4) });
  assert.equal(stats.media.length, 1);
  assert.ok(Math.abs(stats.media[0].duration - 360) < 1e-6);
  assert.equal(analyze(data, { start: at(9.8), end: at(10.1) }).switches, 0);
});

test("pointer anchored zoom is reversible and bounded from week to seconds", () => {
  const view = { start: at(9), end: at(18) };
  const anchor = at(11);
  const zoomed = zoomRange(view, 0.5, anchor, data.bounds);
  assert.ok(
    Math.abs(
      (anchor - view.start) / (view.end - view.start) -
        (anchor - zoomed.start) / (zoomed.end - zoomed.start),
    ) < 1e-9,
  );
  assert.deepEqual(zoomRange(zoomed, 2, anchor, data.bounds), view);
  assert.equal(
    zoomRange(view, 0.0000001, anchor, data.bounds).end -
      zoomRange(view, 0.0000001, anchor, data.bounds).start,
    2,
  );
  assert.deepEqual(clampRange({ start: -200, end: 200 }, data.bounds), {
    start: 0,
    end: 400,
  });
  assert.deepEqual(zoomRange(view, 100, anchor, data.bounds), data.bounds);
});
