import { test } from "node:test";
import assert from "node:assert/strict";
import { overviewContext } from "../src/history";
import { historyOverviewGeometry } from "../src/overview";
import { clampRange, zoomRange, MAX_VIEW_SECONDS } from "../src/model";
import type { Capture } from "../src/model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordedOverview } from "../src/RecordedOverview";

test("recorded overview always renders one heading and CPU paths without period controls or bars", () => {
  const range = { start: 100, end: 200 };
  const data: Capture = { kind: "recorded", epoch: new Date(0).toISOString(), bounds: range, samplePeriod: 2,
    apps: [], metrics: [], activity: [], background: [], afk: [], media: [], events: [] };
  const render = (loading: boolean) => renderToStaticMarkup(createElement(RecordedOverview, {
    data, label: "Preview", color: "#fff", onView: () => {},
    history: { view: range, onView: () => {}, selection: null, onSelection: () => {}, overviewRange: range, loading, progress: "1/2",
      preview: { range, cpu: [{ startMs: 100000, endMs: 200000, value: 20 }] } },
  }));
  for (const loading of [false, true]) {
    const markup = render(loading);
    assert.equal((markup.match(/class="tx-overview-heading"/g) ?? []).length, 1);
    const graph = markup.match(/<svg[^>]*role="img"[^>]*>([\s\S]*?)<\/svg>/)?.[1] ?? "";
    assert.equal((graph.match(/<path d=/g) ?? []).length, 2);
    assert.ok(!markup.includes("<rect") && !markup.includes("tx-history-period") && !/<p[\s>]/.test(markup));
    assert.ok(markup.includes('role="status" class="tx-history-progress"'));
  }
});

test("continuous history navigation stops at 5000 hours instead of querying an unbounded archive", () => {
  const bounds = { start: 0, end: 20000 * 3600 };
  const view = clampRange(bounds, bounds);
  assert.equal(view.end, bounds.end);
  assert.equal(view.end - view.start, MAX_VIEW_SECONDS);
  const zoomed = zoomRange(view, 3, view.end, bounds);
  assert.equal(zoomed.end, view.end);
  assert.equal(zoomed.end - zoomed.start, MAX_VIEW_SECONDS);
});

test("overview context follows continuous zoom immediately, including a full month", () => {
  const bounds = { start: 0, end: 100 * 86400 };
  const view = { start: 40 * 86400, end: 70 * 86400 };
  const context = overviewContext(view, bounds);
  assert.ok(context.start < view.start && context.end > view.end);
  assert.deepEqual(overviewContext({ start: 0, end: 3600 }, bounds), { start: 0, end: 7200 });
  const zoomed = overviewContext({ start: view.start, end: view.start + 3600 }, bounds);
  assert.ok(zoomed.end < context.end, "Geometry never depends on an older fetched preview");
});

test("overview navigation keeps its coordinate system through dragging and release, while main zoom can reframe", () => {
  const limits = { start: 0, end: 100000 };
  const initial = { start: 20000, end: 30000 }, context = overviewContext(initial, limits);
  const moved = { start: 21000, end: 31000 };
  assert.equal(overviewContext(moved, limits, context), context);
  const fraction = (range: typeof initial) => (range.start - context.start) / (context.end - context.start);
  assert.ok(fraction(moved) > fraction(initial), "The selection must visibly move with the pointer");
  assert.equal(overviewContext(moved, limits, context), context, "Release must not recenter the selection");
  assert.notDeepEqual(overviewContext(moved, limits), context, "An external navigation can choose fresh context");
});

test("CPU preview has one shared line/area boundary, preserves zero and breaks missing runs", () => {
  const geometry = historyOverviewGeometry([
    { startMs: 0, endMs: 1000, value: 0 },
    { startMs: 1000, endMs: 2000, value: 100 },
    { startMs: 4000, endMs: 5000, value: 20 },
  ], { start: 0, end: 5 });
  const runs = geometry.line.split(/ (?=M)/);
  assert.equal(runs.length, 2);
  assert.ok(geometry.line.startsWith("M0,40"));
  assert.ok(geometry.line.includes(",4"));
  for (const run of runs) assert.ok(geometry.area.includes(run), "Fill follows the exact same top edge");
});

test("old preview samples clip to new geometry without out-of-range paths or fabricated zeros", () => {
  const cpu = [{ startMs: 0, endMs: 10000, value: 30 }];
  const geometry = historyOverviewGeometry(cpu, { start: 4, end: 6 });
  const points = [...geometry.line.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
  assert.deepEqual(points.map(point => point[0]), [0, 700, 1400]);
  assert.ok(points.every(point => Math.abs(point[1] - 29.2) < 1e-10));
  assert.deepEqual(historyOverviewGeometry(cpu, { start: 12, end: 15 }), { line: "", area: "", points: [] });
});

test("a sub-pixel isolated observation becomes a point without a vertical filled stripe", () => {
  const geometry = historyOverviewGeometry([{ startMs: 100000, endMs: 102000, value: 50 }], { start: 0, end: 10000 });
  assert.equal(geometry.line, "");
  assert.equal(geometry.area, "");
  assert.equal(geometry.points.length, 1);
  assert.equal(geometry.points[0].y, 22);
});
