import assert from "node:assert/strict";
import test from "node:test";
import { metricAt, metricSampleAt } from "@tracel/timeline/model";
import { createQuotaDemo } from "../src/quota/demo";
import { quotaCapture, quotaKey } from "../src/quota/model";
import { quotaStatistics } from "../src/quota/statistics";

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
