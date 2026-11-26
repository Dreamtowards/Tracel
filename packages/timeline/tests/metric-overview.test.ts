import assert from "node:assert/strict";
import test from "node:test";
import { constrainOverviewRange, metricOverviewGeometry, overviewCalendarTicks } from "../src/overview";
import { metricAt, type Capture } from "../src/model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Timeline } from "../src/Timeline";
import { defaultAppearance } from "../src/DisplaySettings";

const capture: Capture = {
  epoch: "2026-11-01T00:00:00Z", bounds: { start: 0, end: 1200 }, samplePeriod: 300,
  apps: [], activity: [], afk: [], background: [], media: [], events: [],
  metricOverrides: { "metric:balance": { max: 500, unit: "CNY" } },
  metrics: [0, 250, null, 500].map((value, index) => ({ time: index * 300, subject: { kind: "system", id: "test" }, values: { "metric:balance": value } })),
};

test("custom metric overview scales raw units, preserves zero, and breaks at missing intervals", () => {
  const geometry = metricOverviewGeometry(capture, "metric:balance", 4);
  assert.equal((geometry.line.match(/M/g) ?? []).length, 2);
  assert.ok(geometry.line.startsWith("M0,40"));
  assert.ok(geometry.line.includes(",4"));
  assert.equal(metricAt(capture, 100, "metric:balance"), 0);
  assert.equal(metricAt(capture, 601, "metric:balance"), null);
});

test("overview remains bounded at month scale and keeps gaps within a display bucket", () => {
  const dense: Capture = { ...capture, bounds: { start: 0, end: 86400 * 30 }, metrics: Array.from({ length: 8640 }, (_, index) => ({ time: index * 300, subject: { kind: "system", id: "test" }, values: { "metric:balance": 250 } })) };
  const geometry = metricOverviewGeometry(dense, "metric:balance", 100);
  assert.ok((geometry.line.match(/L/g) ?? []).length <= 102);
  const gap = metricOverviewGeometry(capture, "metric:balance", 1);
  assert.equal((gap.line.match(/M/g) ?? []).length, 2);
});

test("zoomed overview clips to its own context and retains gaps and original units", () => {
  const geometry = metricOverviewGeometry(capture, "metric:balance", 3, { start: 300, end: 1200 });
  assert.ok(geometry.line.startsWith("M0,22"));
  assert.equal((geometry.line.match(/M/g) ?? []).length, 2);
  assert.ok(geometry.line.endsWith("L1400,4"));
});

test("fractional overview buckets never introduce gaps in a continuously observed series", () => {
  const dense: Capture = { ...capture, bounds: { start: 0, end: 6000 }, metrics: Array.from({ length: 20 }, (_, index) => ({ time: index * 300, subject: { kind: "system", id: "test" }, values: { "metric:balance": 250 } })) };
  const geometry = metricOverviewGeometry(dense, "metric:balance", 600, { start: 105.234, end: 5713.829 });
  assert.equal((geometry.line.match(/M/g) ?? []).length, 1);
  assert.ok(geometry.line.startsWith("M0,22"));
  assert.ok(geometry.line.endsWith("L1400,22"));
});

test("overview zoom and pan keep the main viewport visible without changing it", () => {
  const view = { start: 800, end: 900 }, bounds = { start: 0, end: 1200 };
  assert.deepEqual(constrainOverviewRange({ start: 100, end: 200 }, view, bounds), view);
  assert.deepEqual(constrainOverviewRange({ start: 0, end: 500 }, view, bounds), { start: 400, end: 900 });
  assert.deepEqual(constrainOverviewRange({ start: 1000, end: 1600 }, view, bounds), { start: 600, end: 1200 });
  assert.deepEqual(view, { start: 800, end: 900 });
  assert.deepEqual(constrainOverviewRange({ start: 400, end: 600 }, { start: 200, end: 1100 }, bounds), { start: 200, end: 1100 });
});

test("overview calendar marks local days and Monday weeks at actual epoch-relative positions", () => {
  const origin = new Date(2026, 10, 2, 6).getTime(), epoch = new Date(origin).toISOString();
  const bounds = { start: 0, end: 20 * 86400 };
  const full = overviewCalendarTicks(epoch, bounds, 1200);
  assert.equal(full.ticks.length, 20);
  assert.equal(full.ticks[0].time, (new Date(2026, 10, 3).getTime() - origin) / 1000);
  for (const tick of full.ticks) {
    const day = new Date(origin + tick.time * 1000);
    assert.equal(day.getHours(), 0);
    assert.equal(tick.week, day.getDay() === 1);
  }
  const zoomBounds = { start: 2 * 86400, end: 9 * 86400 };
  const zoomed = overviewCalendarTicks(epoch, zoomBounds, 1200);
  const sameDay = full.ticks.find(tick => tick.time === zoomed.ticks[0].time)!;
  assert.notEqual(sameDay.position, zoomed.ticks[0].position);
  assert.equal(zoomed.ticks[0].position, (sameDay.time - zoomBounds.start) / (zoomBounds.end - zoomBounds.start));
});

test("overview calendar labels become sparse on small screens and retain a date within one day", () => {
  const bounds = { start: 0, end: 30 * 86400 };
  const wide = overviewCalendarTicks(capture.epoch, bounds, 1200), narrow = overviewCalendarTicks(capture.epoch, bounds, 320);
  assert.ok(narrow.labels.length < wide.labels.length);
  for (let i = 1; i < narrow.labels.length; i++) assert.ok((narrow.labels[i].position - narrow.labels[i - 1].position) * 320 >= 64);
  const short = overviewCalendarTicks(new Date(2026, 10, 12, 10).toISOString(), { start: 0, end: 3600 }, 320);
  assert.deepEqual(short.labels, [{ time: 0, position: 0 }]);
  assert.equal(short.ticks.length, 0);
});

test("overview calendar advances by calendar days through daylight saving transitions", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    const origin = new Date(2026, 2, 7).getTime(), end = new Date(2026, 2, 11).getTime();
    const { ticks } = overviewCalendarTicks(new Date(origin).toISOString(), { start: 0, end: (end - origin) / 1000 }, 800);
    assert.deepEqual(ticks.map(tick => new Date(origin + tick.time * 1000).getDate()), [7, 8, 9, 10]);
    assert.equal(ticks[2].time - ticks[1].time, 23 * 3600);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("the shared Timeline replaces system rows only when custom groups are supplied", () => {
  const render = (data: Capture) => renderToStaticMarkup(createElement(Timeline, {
    data, view: data.bounds, selection: null, mode: "select", focus: null, appearance: defaultAppearance,
    onView: () => {}, onSelect: () => {}, onFocus: () => {},
  }));
  const custom = render({ ...capture, metricGroups: [{ id: "account-1", name: "Account 1", tracks: [{ id: "balance", name: "Balance", keys: ["metric:balance"] }] }] });
  assert.ok(custom.includes("Account 1") && custom.includes("Balance"));
  assert.ok(!custom.includes("SYSTEM PERFORMANCE") && !custom.includes(">CPU<"));
  const original = render(capture);
  assert.ok(original.includes("SYSTEM PERFORMANCE") && original.includes(">CPU<"));
});
