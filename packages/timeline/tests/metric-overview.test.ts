import assert from "node:assert/strict";
import test from "node:test";
import { metricOverviewGeometry } from "../src/overview";
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
