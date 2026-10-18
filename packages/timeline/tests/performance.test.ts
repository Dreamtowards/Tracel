import { test } from "node:test";
import assert from "node:assert/strict";
import { metricSamples, metricSeries } from "../src/metricIndex";
import { frameQueue } from "../src/frameQueue";
import { analyze } from "../src/analytics";
import { sampleEnd, type Capture, type MetricKey, type MetricSample } from "../src/model";

function capture(metrics: MetricSample[], samplePeriod = 2): Capture {
  return { epoch: "2026-10-18T00:00:00Z", bounds: { start: 0, end: 86400 }, samplePeriod,
    apps: [], activity: [], background: [], afk: [], media: [], events: [], metrics };
}
const sample = (time: number, end: number | undefined, values: MetricSample["values"]): MetricSample =>
  ({ time, end, values, subject: { kind: "system", id: "system" } });

test("metric index preserves half-open boundaries, long overlapping intervals, duplicate times, zeros and gaps", () => {
  const data = capture([
    sample(0, 100, { cpu: 0 }), sample(1, 2, { ram: 3 }),
    sample(20, 21, { cpu: null }), sample(20, 25, { cpu: 70 }),
    sample(20, 30, { ram: 8 }), sample(31, 32, { cpu: NaN }),
    sample(99, undefined, { cpu: 100 }), sample(110, 111, { cpu: Infinity }),
  ]);
  for (const range of [{ start: 20, end: 21 }, { start: 25, end: 31 }, { start: 100, end: 101 }, { start: 101, end: 109 }]) {
    for (const key of ["cpu", "ram", "audio"] as MetricKey[]) {
      const expected = data.metrics.filter(s => s.time < range.end && sampleEnd(s, data.samplePeriod) > range.start
        && s.values?.[key] != null && Number.isFinite(s.values[key]));
      assert.deepEqual([...metricSamples(data, key, range)], expected);
    }
  }
  assert.equal(analyze(data, { start: 25, end: 31 }).metrics.cpu.average, 0);
  assert.equal(analyze(data, { start: 101, end: 109 }).metrics.cpu.coverage, 0);
  assert.equal(metricSeries(data), metricSeries({ ...data }));
  const changed = { ...data, metrics: [...data.metrics, sample(120, 122, { cpu: 42 })] };
  assert.notEqual(metricSeries(data), metricSeries(changed));
  assert.equal(analyze(changed, { start: 120, end: 122 }).metrics.cpu.average, 42);
});

test("indexed metrics match a linear oracle across irregular supports and many range queries", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const data = capture(Array.from({ length: 6000 }, (_, i) => sample(Math.floor(i / 2), Math.floor(i / 2) + 1 + random() * 20,
    i % 5 ? { cpu: i % 17 ? random() * 100 : 0 } : { ram: random() * 32 })));
  for (let i = 0; i < 100; i++) {
    const start = random() * 3000, range = { start, end: start + 1 + random() * 70 };
    const stats = analyze(data, range);
    for (const key of ["cpu", "ram"] as const) {
      let integral = 0, coverage = 0, peak = 0;
      for (const s of data.metrics) {
        const value = s.values?.[key];
        if (value == null || !Number.isFinite(value)) continue;
        const weight = Math.max(0, Math.min(sampleEnd(s, data.samplePeriod), range.end) - Math.max(s.time, range.start));
        if (!weight) continue;
        integral += weight * value; coverage += weight; peak = Math.max(peak, value);
      }
      assert.deepEqual(stats.metrics[key], { total: integral, coverage, peak: coverage ? peak : null, average: coverage ? integral / coverage : null });
    }
  }
});

test("frame queue coalesces input, flushes the final endpoint and cancels stale work", () => {
  let next = 0;
  const scheduled = new Map<number, FrameRequestCallback>();
  const queue = frameQueue(callback => { scheduled.set(++next, callback); return next; }, id => { scheduled.delete(id); });
  const result: number[] = [];
  for (let i = 0; i < 100; i++) queue.schedule(() => result.push(i));
  assert.equal(scheduled.size, 1);
  [...scheduled.values()][0](0);
  assert.deepEqual(result, [99]);
  queue.schedule(() => result.push(100));
  queue.flush();
  queue.flush();
  assert.deepEqual(result, [99, 100]);
  assert.equal(scheduled.size, 0);
  queue.schedule(() => result.push(-1));
  queue.clear();
  queue.flush();
  assert.deepEqual(result, [99, 100]);
});
