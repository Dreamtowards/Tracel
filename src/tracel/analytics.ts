import { Capture, MetricKey, Range, overlap } from "./model";

/** Half-open intervals; sample values are held for exactly samplePeriod seconds. */
export function analyze(data: Capture, range: Range) {
  const activeTime = (interval: Range) => {
    const clipped = {
      start: Math.max(interval.start, range.start),
      end: Math.min(interval.end, range.end),
    };
    return Math.max(
      0,
      overlap(interval, range) -
        data.afk.reduce((sum, afk) => sum + overlap(clipped, afk), 0),
    );
  };
  const apps = data.apps
    .map((app) => {
      const intervals = data.activity.filter((a) => a.appId === app.id);
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
    (
      [
        "cpu",
        "ram",
        "gpu",
        "download",
        "upload",
        "read",
        "write",
        "audio",
      ] as MetricKey[]
    ).map((key) => {
      let integral = 0,
        peak = 0,
        coverage = 0;
      const first = Math.max(0, Math.floor(range.start / data.samplePeriod));
      const last = Math.min(
        data.metrics.length,
        Math.ceil(range.end / data.samplePeriod),
      );
      for (let i = first; i < last; i++) {
        const sample = data.metrics[i];
        if (!sample.values) continue;
        const weight = overlap(
          { start: sample.time, end: sample.time + data.samplePeriod },
          range,
        );
        if (!weight) continue;
        coverage += weight;
        integral += sample.values[key] * weight;
        peak = Math.max(peak, sample.values[key]);
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
