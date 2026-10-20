import { test } from "node:test";
import assert from "node:assert/strict";
import { absoluteCapture, compactCapture, combineAnalyses, combineCaptures } from "../src/historyProjection";
import { analyze } from "@tracel/timeline/analytics";
import type { Capture, MetricSample } from "@tracel/timeline/model";

test("an unrecorded wide range returns missing metrics instead of an incomplete statistics shape", () => {
    const stats = combineAnalyses([]);
    assert.equal(stats.metrics.cpu.average, null);
    assert.equal(stats.metrics.ram.average, null);
    assert.equal(stats.metrics.download.coverage, 0);
    assert.equal(stats.metrics.write.total, 0);
    assert.equal(stats.active, 0);
    assert.deepEqual(stats.apps, []);
});
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

test("query boundaries never split an unchanged window context, including across repeated refreshes", () => {
    const data = fixture(), epoch = Date.parse(data.epoch) / 1000;
    data.activity[0].windowId = "window-1";
    data.activity[0].processInstanceId = "process-1";
    data.activity[0].contexts = [{ start: 0, end: 60, kind: "window", title: "Title", value: "Title" }];
    const before = structuredClone(data);
    for (const cut of [10, 20, 30, 40, 50]) {
        const items = [absoluteCapture(data, { start: epoch, end: epoch + cut }), absoluteCapture(data, { start: epoch + cut, end: epoch + 100 })];
        const merged = combineCaptures(items, { start: epoch, end: epoch + 100 });
        assert.equal(merged.activity.length, 1);
        assert.deepEqual(merged.activity[0].contexts, [{ start: epoch, end: epoch + 60, kind: "window", title: "Title", value: "Title" }]);
        assert.equal(items[0].activity[0].end, epoch + cut, "Combining must not mutate cached blocks");
    }
    assert.deepEqual(data, before);
});

test("stitching preserves actual title changes, window changes and observation gaps", () => {
    const data = fixture();
    const event = data.activity[0];
    data.activity = [
        {...event, start:0,end:10,windowId:"1"},
        {...event, start:10,end:20,windowId:"1",windowTitle:"Other"},
        {...event, start:20,end:30,windowId:"2",windowTitle:"Other"},
        {...event, start:32,end:40,windowId:"2",windowTitle:"Other"},
    ];
    const merged = combineCaptures([data], data.bounds);
    assert.equal(merged.activity.length, 4);
    assert.deepEqual(merged.activity.map(a=>[a.start,a.end]),[[0,10],[10,20],[20,30],[32,40]]);
});
