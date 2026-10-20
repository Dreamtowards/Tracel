import { sampleEnd, type Capture, type Range } from "./model";
import type { HistoryCpuBucket } from "./history";

/** The stroke and area share the same boundary; missing intervals break both paths. */
export function historyOverviewGeometry(cpu: HistoryCpuBucket[], bounds: Range) {
  const x = (seconds: number) => (seconds - bounds.start) / (bounds.end - bounds.start) * 1400;
  const outline: string[] = [], area: string[] = [];
  let run: string[] = [], first = 0, last = 0, lastY = 0, previousEnd = -Infinity;
  const finish = () => {
    if (!run.length) return;
    const line = `${run.join(" ")} L${last},${lastY}`;
    outline.push(line);
    area.push(`${line} L${last},42 L${first},42 Z`);
    run = [];
  };
  for (const bucket of cpu) {
    const start = Math.max(bounds.start, bucket.startMs / 1000), end = Math.min(bounds.end, bucket.endMs / 1000);
    if (start >= end || !Number.isFinite(bucket.value)) continue;
    const y = 40 - Math.max(0, Math.min(100, bucket.value)) / 100 * 36;
    if (start > previousEnd + .001) finish();
    if (!run.length) {
      first = x(start);
      run.push(`M${first},${y}`);
    }
    run.push(`L${x((start + end) / 2)},${y}`);
    last = x(end);
    lastY = y;
    previousEnd = end;
    // Connect adjacent means directly rather than drawing peak-to-baseline spikes.
  }
  finish();
  return { line: outline.join(" "), area: area.join(" ") };
}

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
