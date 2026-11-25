import assert from "node:assert/strict";
import test from "node:test";
import { metricAt, metricSampleAt } from "@tracel/timeline/model";
import { createQuotaDemo } from "../src/quota/demo";
import { quotaCapture, quotaKey } from "../src/quota/model";
import { quotaStatistics } from "../src/quota/statistics";
import { quotaDateKey, quotaDayRange, quotaDuration, quotaRangeLabel } from "../src/quota/time";

const now = Date.parse("2026-11-26T04:00:00Z");
const dataset = createQuotaDemo(now);
const capture = quotaCapture(dataset);

test("quota demo is reproducible with independent account/window identities", () => {
  assert.deepEqual(dataset, createQuotaDemo(now));
  assert.equal(dataset.samples.length, 30 * 24 * 12);
  assert.equal(dataset.mode, "demo");
  assert.equal(dataset.accounts.filter(account => account.provider === "OpenAI").length, 2);
  assert.equal(capture.metricGroups?.find(group => group.id === "account:kimi-1")?.tracks.length, 2);
  assert.equal(new Set(dataset.tracks.map(track => track.id)).size, dataset.tracks.length);
  assert.deepEqual(Object.keys(dataset.samples[0]).sort(), ["at", "values"]);
  assert.ok(dataset.resets.some(reset => reset.kind === "confirmed"));
  assert.ok(dataset.resets.some(reset => reset.kind === "projected"));
});

test("quota adapter preserves UTC times, zero, gaps, raw units and separate resets", () => {
  assert.equal(Date.parse(capture.epoch), dataset.startMs);
  const exhausted = quotaKey("glm-week");
  assert.equal(metricAt(capture, capture.bounds.end - 1, exhausted), 0);
  const gap = dataset.samples.find(sample => sample.values["kimi-week"] === null)!;
  const time = (gap.at - dataset.startMs) / 1000 + 1;
  assert.equal(metricAt(capture, time, quotaKey("kimi-week")), null);
  const sample = metricSampleAt(capture, time, exhausted)!;
  assert.equal(sample.time, time - 1);
  assert.equal(capture.metricOverrides?.[quotaKey("deepseek-balance")]?.unit, "CNY");
  assert.equal(capture.metricMarkers?.length, dataset.resets.length);
  assert.equal(metricAt(capture, capture.bounds.end - 1, quotaKey("tripo-credits")), null);
});

test("range details count coverage and confirmed resets without treating gaps as zero", () => {
  const key = quotaKey("kimi-week");
  const gap = dataset.samples.find(sample => sample.values["kimi-week"] === null)!;
  const start = (gap.at - dataset.startMs) / 1000;
  const empty = quotaStatistics(capture, key, { start, end: start + 3600 });
  assert.equal(empty.first, null);
  assert.equal(empty.minimum, null);
  assert.equal(empty.coverage, 0);
  const full = quotaStatistics(capture, key, capture.bounds);
  assert.equal(full.coverage, 1 - 3 / (30 * 24));
  assert.equal(full.resets, dataset.resets.filter(reset => reset.trackId === "kimi-week" && reset.kind === "confirmed").length);
  assert.equal(quotaStatistics(capture, quotaKey("glm-week"), { start: 29 * 86400, end: 30 * 86400 }).minimum, 0);
});

test("quota calendar clips partial first/last days to recorded bounds", () => {
  const first = new Date(2026, 10, 24, 6), last = new Date(2026, 10, 26, 9);
  const epoch = first.toISOString(), bounds = { start: 0, end: (last.getTime() - first.getTime()) / 1000 };
  const range = quotaDayRange(quotaDateKey(first.getTime()), epoch, bounds);
  assert.equal(range.start, 0);
  assert.equal(first.getTime() + range.end * 1000, new Date(2026, 10, 25).getTime());
  const finalDay = quotaDayRange(quotaDateKey(last.getTime()), epoch, bounds);
  assert.equal(first.getTime() + finalDay.start * 1000, new Date(2026, 10, 26).getTime());
  assert.equal(finalDay.end, bounds.end);
});

test("range labels omit duplicate dates and seconds, including a full calendar day", () => {
  const start = new Date(2026, 10, 25, 9), epoch = start.toISOString();
  assert.equal(quotaRangeLabel(epoch, { start: 0, end: 3.5 * 3600 }), "11月25日 09:00 — 12:30");
  const midnight = new Date(2026, 10, 25).toISOString();
  assert.equal(quotaRangeLabel(midnight, { start: 0, end: 86400 }), "11月25日 00:00 — 24:00");
  assert.equal(quotaRangeLabel(epoch, { start: 0, end: 86400 }), "11月25日 09:00 — 11月26日 09:00");
  assert.equal(quotaDuration(3.5 * 3600), "3小时 30分");
});
