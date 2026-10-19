import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteCapture, compactCapture, combineAnalyses, combineCaptures } from "../src/historyProjection";
import { analyze } from "@tracel/timeline/analytics";
import type { Capture, MetricSample } from "@tracel/timeline/model";
function fixture(): Capture {
    const sample = (time: number, end: number, cpu: number | null): MetricSample => ({ time, end, subject: { kind: "system", id: "system" }, values: { cpu, ram: 8 } });
    return { kind: "recorded", epoch: "2026-10-18T00:00:00Z", bounds: { start: 0, end: 100 }, samplePeriod: 2,
        apps: [{ id: "editor", name: "Editor", exe: "Editor.exe", color: "#fff", glyph: "E" }],
        activity: [{ id: "one", start: 0, end: 60, appId: "editor", windowTitle: "Title", contexts: [] }], background: [{ start: 0, end: 60, appId: "editor" }], afk: [{ start: 20, end: 30, reason: "Idle" }], media: [], events: [],
        metrics: [sample(0, 2, 0), sample(2, 4, 100), sample(4, 10, 20), sample(50, 52, null), sample(80, 82, 40)] };
}
test("coarse bins preserve zero, extrema, covered seconds and visible missing bins", () => {
    const data = fixture(), before = structuredClone(data), lod = compactCapture(data, 10);
    assert.equal(lod.detailLevel, "aggregate");
    assert.equal(lod.metrics[0].extrema?.cpu?.min, 0);
    assert.equal(lod.metrics[0].extrema?.cpu?.max, 100);
    assert.equal(lod.metrics[0].coverage?.cpu, 10);
    assert.equal(lod.metrics[0].values?.cpu, 32);
    assert.ok(!lod.metrics.some(s => s.time === 20));
    assert.equal(lod.metrics.find(s => s.time === 50)?.values?.cpu, undefined);
    assert.deepEqual(analyze(lod, data.bounds).metrics.cpu, analyze(data, data.bounds).metrics.cpu);
    assert.deepEqual(data, before);
});
test("hour blocks clip to absolute time without double counting and merge exact covered statistics", () => {
    const data = fixture(), offset = Date.parse(data.epoch) / 1000;
    const left = absoluteCapture(data, { start: offset, end: offset + 30 }), right = absoluteCapture(data, { start: offset + 30, end: offset + 100 });
    assert.equal(left.activity[0].start, offset);
    assert.equal(left.activity[0].end, offset + 30);
    const stats = combineAnalyses([analyze(left, left.bounds), analyze(right, right.bounds)]), full = analyze(data, data.bounds);
    assert.equal(stats.active, full.active);
    assert.equal(stats.foreground, full.foreground);
    assert.equal(stats.afk, full.afk);
    assert.deepEqual(stats.metrics, full.metrics);
    const merged = combineCaptures([left, right], { start: offset, end: offset + 100 });
    assert.equal(merged.background.length, 1);
    assert.equal(merged.background[0].end, offset + 60);
    assert.deepEqual(analyze(merged, merged.bounds).metrics, full.metrics);
});
