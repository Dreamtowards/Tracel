import type { Capture } from "./model";

/** Downsample each contiguous run independently: never filter gaps before building a path. */
export function overviewPath(data: Capture): string {
  const commands: string[] = [];
  let connected = false;
  let previousTime = -Infinity;
  for (let i = 0; i < data.metrics.length; i++) {
    const sample = data.metrics[i];
    if (!sample.values) {
      connected = false;
      continue;
    }
    if (sample.time - previousTime > data.samplePeriod) connected = false;
    const lastInRun = !data.metrics[i + 1]?.values;
    if (!connected || i % 6 === 0 || lastInRun) {
      commands.push(
        `${connected ? "L" : "M"}${(sample.time / data.bounds.end) * 1400},${30 - (sample.values.cpu / 100) * 27}`,
      );
      connected = true;
    }
    previousTime = sample.time;
  }
  return commands.join(" ");
}
