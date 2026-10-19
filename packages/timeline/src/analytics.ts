import { Capture, MetricKey, Range, overlap, sampleEnd, metricInfo } from "./model";
import { metricSamples } from "./metricIndex";

/** Half-open support intervals; missing values are excluded independently per metric. */
export function analyze(data: Capture, range: Range) {
  const visibleAfk = data.afk.filter(item => overlap(item, range) > 0);
  const byApp = new Map<string, Capture["activity"]>();
  for (const item of data.activity) {
    if (!overlap(item, range)) continue;
    const list = byApp.get(item.appId) ?? []; list.push(item); byApp.set(item.appId, list);
  }
  const activeTime = (interval: Range) => {
    const clipped = {
      start: Math.max(interval.start, range.start),
      end: Math.min(interval.end, range.end),
    };
    return Math.max(
      0,
      overlap(interval, range) -
        visibleAfk.reduce((sum, afk) => sum + overlap(clipped, afk), 0),
    );
  };
  const apps = data.apps
    .map((app) => {
      const intervals = byApp.get(app.id) ?? [];
      return {
        ...app,
        foreground: intervals.reduce((s, a) => s + overlap(a, range), 0),
        active: intervals.reduce((s, a) => s + activeTime(a), 0),
        contexts: intervals
          .flatMap((a) => a.contexts)
          .filter((c) => overlap(c, range) > 0),
      };
    })
    .sort((a, b) => b.active - a.active);
  const metrics = Object.fromEntries(
    ([...new Set([...Object.keys(metricInfo), ...Object.keys(data.metricOverrides ?? {})])] as MetricKey[]).map((key) => {
      let integral = 0,
        peak = 0,
        coverage = 0;
      for (const sample of metricSamples(data, key, range)) {
        const value = sample.values?.[key];
        if (value == null || !Number.isFinite(value)) continue;
        const covered = overlap(
          { start: sample.time, end: sampleEnd(sample, data.samplePeriod) },
          range,
        );
        const weight = covered * (sample.coverage?.[key] == null ? 1 : sample.coverage[key]! / (sampleEnd(sample,data.samplePeriod)-sample.time));
        if (!weight) continue;
        coverage += weight;
        integral += value * weight;
        peak = Math.max(peak, sample.extrema?.[key]?.max ?? value);
      }
      return [
        key,
        {
          average: coverage ? integral / coverage : null,
          peak: coverage ? peak : null,
          total: integral,
          coverage,
        },
      ];
    }),
  ) as Record<
    MetricKey,
    {
      average: number | null;
      peak: number | null;
      total: number;
      coverage: number;
    }
  >;
  return {
    apps,
    metrics,
    active: apps.reduce((s, a) => s + a.active, 0),
    foreground: apps.reduce((s, a) => s + a.foreground, 0),
    afk: data.afk.reduce((s, a) => s + overlap(a, range), 0),
    switches: data.activity.filter(
      (a, i) =>
        i > 0 &&
        a.start > range.start &&
        a.start < range.end &&
        data.activity[i - 1].end === a.start &&
        data.activity[i - 1].appId !== a.appId,
    ).length,
    media: data.media
      .filter((m) => overlap(m, range) > 0)
      .map((m) => ({ ...m, duration: overlap(m, range) })),
  };
}
