import { metricSamples } from "@tracel/timeline/metric-index";
import { sampleEnd, type Capture, type MetricKey, type Range } from "@tracel/timeline/model";

export function quotaStatistics(data: Capture, key: MetricKey, range: Range) {
  let first: number | null = null, last: number | null = null;
  let covered = 0, minimum = Infinity, maximum = -Infinity;
  for (const sample of metricSamples(data, key, range)) {
    const value = sample.values?.[key];
    if (value == null) continue;
    first ??= value; last = value;
    minimum = Math.min(minimum, value); maximum = Math.max(maximum, value);
    covered += Math.max(0, Math.min(range.end, sampleEnd(sample, data.samplePeriod)) - Math.max(range.start, sample.time));
  }
  return { first, last, minimum: first === null ? null : minimum, maximum: first === null ? null : maximum,
    coverage: Math.min(1, covered / (range.end - range.start)),
    change: first === null || last === null ? null : last - first,
    resets: data.metricMarkers?.filter(marker => marker.key === key && marker.kind === "confirmed" && marker.time >= range.start && marker.time < range.end).length ?? 0 };
}
