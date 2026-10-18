import { sampleEnd, type Capture, type MetricKey, type MetricSample, type Range } from "./model";

type Series = { samples: MetricSample[]; endPrefix: number[] };
const cache = new WeakMap<MetricSample[], { period: number; series: Map<MetricKey, Series> }>();

/** Seed an immutable successor from the old index, updating only affected series tails. */
export function inheritMetricIndex(previous: Capture, next: Capture, removed: ReadonlySet<MetricSample>, added: MetricSample[]) {
  const prior = cache.get(previous.metrics);
  if (!prior || prior.period !== next.samplePeriod) return;
  const additions = metricSeries({ ...next, metrics: added });
  const series = new Map<MetricKey, Series>();
  let firstRemovedTime = Infinity;
  for (const sample of removed) firstRemovedTime = Math.min(firstRemovedTime, sample.time);
  for (const key of new Set([...prior.series.keys(), ...additions.keys()])) {
    const old = prior.series.get(key), extra = additions.get(key);
    let length = old?.samples.length ?? 0;
    while (length && removed.has(old!.samples[length - 1])) length--;
    const retained = old?.samples.slice(0, length) ?? [];
    // The native adapter replaces the last observation. Keep the helper safe for other callers too.
    let low = 0, high = length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (retained[mid].time < firstRemovedTime) low = mid + 1;
      else high = mid;
    }
    let internalRemoval = false;
    for (let i = low; i < length; i++) if (removed.has(retained[i])) { internalRemoval = true; break; }
    if (internalRemoval || (extra?.samples.length && retained.length && extra.samples[0].time < retained.at(-1)!.time)) {
      const samples = retained.filter(sample => !removed.has(sample)).concat(extra?.samples ?? []).sort((a, b) => a.time - b.time);
      const endPrefix: number[] = [];
      for (const sample of samples) endPrefix.push(Math.max(endPrefix.at(-1) ?? -Infinity, sampleEnd(sample, next.samplePeriod)));
      series.set(key, { samples, endPrefix });
    } else {
      const endPrefix = old?.endPrefix.slice(0, length) ?? [];
      for (const sample of extra?.samples ?? []) {
        retained.push(sample);
        endPrefix.push(Math.max(endPrefix.at(-1) ?? -Infinity, sampleEnd(sample, next.samplePeriod)));
      }
      series.set(key, { samples: retained, endPrefix });
    }
  }
  cache.set(next.metrics, { period: next.samplePeriod, series });
}

/** Capture arrays are immutable. Index once per snapshot, shared by drawing and analytics. */
export function metricSeries(data: Capture): Map<MetricKey, Series> {
  const cached = cache.get(data.metrics);
  if (cached?.period === data.samplePeriod) return cached.series;
  const series = new Map<MetricKey, Series>();
  for (const sample of data.metrics) {
    if (!sample.values) continue;
    for (const [name, value] of Object.entries(sample.values)) {
      if (value == null || !Number.isFinite(value)) continue;
      const key = name as MetricKey;
      let entry = series.get(key);
      if (!entry) { entry = { samples: [], endPrefix: [] }; series.set(key, entry); }
      entry.samples.push(sample);
      entry.endPrefix.push(Math.max(entry.endPrefix.at(-1) ?? -Infinity, sampleEnd(sample, data.samplePeriod)));
    }
  }
  cache.set(data.metrics, { period: data.samplePeriod, series });
  return series;
}

/** Prefix maxima keep long/overlapping support intervals, including duplicate timestamps. */
export function* metricSamples(data: Capture, key: MetricKey, range: Range): Generator<MetricSample> {
  const entry = metricSeries(data).get(key);
  if (!entry) return;
  let low = 0, high = entry.samples.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (entry.endPrefix[mid] <= range.start) low = mid + 1;
    else high = mid;
  }
  for (let i = low; i < entry.samples.length; i++) {
    const sample = entry.samples[i];
    if (sample.time >= range.end) break;
    if (sampleEnd(sample, data.samplePeriod) > range.start) yield sample;
  }
}
