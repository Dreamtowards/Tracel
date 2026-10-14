import { test } from "node:test";
import assert from "node:assert/strict";
import { trafficSeries, rankVisitors, BUCKET_MS } from "../src/radar/analytics";
import { MockVisitorStream } from "../src/radar/simulation/simulation";
import type { TrafficRecord } from "../src/radar/types";

test("traffic counts unique viewing visitors and excludes lifecycle noise", () => {
  const records: TrafficRecord[] = [
    { timestamp: 1000, type: "visitor_joined" },
    { timestamp: 1000, type: "page_view", visitorId: "a" },
    { timestamp: 16000, type: "visitor_joined" },
    { timestamp: 16000, type: "page_view", visitorId: "b" },
    { timestamp: 20000, type: "navigation", visitorId: "b" },
    { timestamp: 35000, type: "visitor_left" },
  ];
  const series = trafficSeries(records, 1, 40000, 45000);
  assert.deepEqual(
    series.map((bucket) => [
      bucket.timestamp,
      bucket.pageViews,
      bucket.visitors,
    ]),
    [
      [0, 1, 1],
      [15000, 2, 1],
      [30000, 0, 0],
    ],
  );
});

test("each navigation is counted in exactly one bucket, including boundaries", () => {
  const records: TrafficRecord[] = [
    { timestamp: 15000, type: "page_view" },
    { timestamp: 30000, type: "navigation" },
  ];
  const series = trafficSeries(records, 3, 30000, 45000);
  assert.deepEqual(
    series.map((bucket) => bucket.pageViews),
    [0, 1, 1],
  );
  assert.deepEqual(
    series.map((bucket) => bucket.visitors),
    [0, 1, 1],
  );
  assert.ok(series.every((bucket) => bucket.timestamp % BUCKET_MS === 0));
  assert.equal(trafficSeries(records, 3, 0).length, 0);
});

test("rankings count each current visitor once and exclude offline sessions", () => {
  const engine = new MockVisitorStream(1700000000000);
  const visitors = Object.values(engine.snapshot().visitors);
  const input = [
    ...visitors,
    { ...visitors[0], id: "offline", status: "offline" as const },
  ];
  for (const dimension of ["country", "city", "browser", "source"] as const) {
    const rows = rankVisitors(input, dimension);
    assert.equal(
      rows.reduce((total, row) => total + row.count, 0),
      12,
    );
    assert.ok(
      Math.abs(rows.reduce((total, row) => total + row.percentage, 0) - 100) <
        1e-10,
    );
    assert.ok(
      rows.every((row, index) => !index || rows[index - 1].count >= row.count),
    );
  }
  assert.deepEqual(rankVisitors([], "country"), []);
});

test("chart history survives feed truncation and stays bounded over time", () => {
  const engine = new MockVisitorStream(1700000000000, 42, 100);
  for (let i = 0; i < 180; i++) engine.advance(1000);
  const snapshot = engine.snapshot();
  const active = Object.values(snapshot.visitors).filter(
    (visitor) => visitor.status !== "offline",
  ).length;
  const series = trafficSeries(snapshot.trafficRecords, active, snapshot.now);
  const actualViews = snapshot.trafficRecords.filter(
    (record) => record.type === "page_view" || record.type === "navigation",
  ).length;
  assert.ok(actualViews > 80);
  assert.equal(
    series.reduce((sum, bucket) => sum + bucket.pageViews, 0),
    actualViews,
  );
  const lastStart = series.at(-1)!.timestamp;
  const expectedVisitors = new Set(
    snapshot.trafficRecords
      .filter(
        (record) =>
          record.timestamp >= lastStart &&
          record.timestamp <= snapshot.now &&
          (record.type === "page_view" || record.type === "navigation"),
      )
      .map((record) => record.visitorId),
  ).size;
  assert.equal(series.at(-1)?.visitors, expectedVisitors);
  assert.ok(series.every((bucket) => bucket.pageViews >= bucket.visitors));
  for (let i = 0; i < 1200; i++) engine.advance(1000);
  const later = engine.snapshot();
  assert.ok(
    later.trafficRecords.every(
      (record) =>
        record.timestamp >= Math.floor((later.now - 600000) / 15000) * 15000,
    ),
  );
  assert.equal(trafficSeries(later.trafficRecords, 1, later.now).length, 40);
});
