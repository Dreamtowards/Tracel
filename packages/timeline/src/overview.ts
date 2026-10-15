import { sampleEnd, type Capture } from "./model";

/** Downsample each contiguous run independently: never filter gaps before building a path. */
export function overviewPath(data: Capture): string {
  const commands: string[] = [];
  let connected = false;
  let previousEnd = -Infinity;
  // Native rates and gauges use separate intervals: a RAM-only interval is not a CPU gap.
  const samples = data.kind === "recorded" ? data.metrics.filter((sample) => sample.values?.cpu != null) : data.metrics;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const value = sample.values?.cpu;
    if (value == null || !Number.isFinite(value)) {
      connected = false;
      continue;
    }
    if (sample.time > previousEnd + 0.001) connected = false;
    const lastInRun = !samples[i + 1]?.values || samples[i + 1].time > sampleEnd(sample,data.samplePeriod) + 0.001;
    if (!connected || i % 6 === 0 || lastInRun) {
      commands.push(
        `${connected ? "L" : "M"}${((sample.time - data.bounds.start) / (data.bounds.end - data.bounds.start)) * 1400},${30 - (value / 100) * 27}`,
      );
      connected = true;
    }
    previousEnd = sampleEnd(sample,data.samplePeriod);
  }
  return commands.join(" ");
}
