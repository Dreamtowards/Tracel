import { sampleEnd, type Capture, type MetricKey, type MetricSample, type Range } from "./model";

type Series = { samples: MetricSample[]; endPrefix: number[] };
const cache = new WeakMap<MetricSample[], { period: number; series: Map<MetricKey, Series> }>();

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
