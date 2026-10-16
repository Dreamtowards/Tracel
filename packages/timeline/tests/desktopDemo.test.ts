import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopDemoCapture, desktopDemoProvider } from "../src/desktopDemo";
import { createCapture } from "../src/data";
import { getMetricInfo, metricAt, type MetricKey } from "../src/model";

test("Desktop demo adds hardware with explicit units without filling missing samples", () => {
  const legacy = createCapture(), demo = createDesktopDemoCapture();
  assert.deepEqual(demo, createDesktopDemoCapture());
  assert.equal(demo.kind, undefined);
  assert.match(demo.source!, /fabricated/);
  assert.equal(demo.metrics.length, legacy.metrics.length);
  const keys = demo.metricTracks!.flatMap(track => [...track.keys, ...track.details ?? []]);
  for (let index = 0; index < demo.metrics.length; index++) {
    const sample = demo.metrics[index];
    if (!legacy.metrics[index].values) { assert.equal(sample.values, null); continue; }
    for (const key of [...keys, "audioInput"] as MetricKey[]) {
      const value = sample.values![key];
      assert.ok(typeof value === "number" && Number.isFinite(value), key);
      assert.ok(value >= 0 && value <= getMetricInfo(demo, key).max, key);
    }
    assert.equal(sample.values!.charging, sample.values!.pluggedIn && sample.values!.battery! < 100 ? 1 : 0);
  }
  assert.ok(legacy.metrics.some(sample => sample.values?.gpu != null));
  assert.ok(demo.metrics.every(sample => sample.values?.gpu == null));
  const missing = demo.metrics.find(sample => sample.values === null)!;
  assert.equal(metricAt(demo, missing.time, "cpuFrequency"), null);
  assert.equal(getMetricInfo(demo, "gpu:demo:dedicated").unit, "GiB");
  assert.ok(demo.metrics.some(sample => sample.values?.audioInput === 0));
  assert.ok(demo.metrics.some(sample => (sample.values?.audioInput ?? 0) > 0));
});

test("injected demo provider returns a labelled Capture with hardware engine tracks", async () => {
  const capture = await desktopDemoProvider.load();
  assert.equal(capture, await desktopDemoProvider.load());
  assert.equal(capture.metricTracks!.find(track => track.id === "demo-gpu")!.details!.length, 4);
  assert.ok(capture.bounds.start <= capture.initialView!.start && capture.initialView!.end <= capture.bounds.end);
});
