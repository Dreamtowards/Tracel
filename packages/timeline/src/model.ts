/** All times are seconds relative to the capture epoch, never wall-clock pixels. */
export type Range = { start: number; end: number };
export type Subject = {
  kind: "system" | "process" | "application" | "device";
  id: string;
};
export type Application = {
  id: string;
  name: string;
  exe: string;
  /** Native source path, separate from the compact EXE name shown in tooltips. */
  executablePath?: string;
  color: string;
  glyph: string;
};
export type ActivityContext = Range & {
  kind: "file" | "url" | "project" | "window";
  title: string;
  value: string;
};
export type ActivityInterval = Range & {
  id: string;
  appId: string;
  windowTitle: string;
  windowId?: string;
  processInstanceId?: string;
  contexts: ActivityContext[];
};
export type AfkInterval = Range & { reason: string };
export type BackgroundLifetime = Range & { appId: string };
export type MetricKey =
  "cpu" | "ram" | "gpu" | "download" | "upload" | "read" | "write" | "audio" | "audioInput" | "cpuFrequency" | "battery" | "pluggedIn" | "charging" | `gpu:${string}`;
export type MetricSample = {
  time: number;
  /** Explicit support interval for irregular native samples; legacy demo uses samplePeriod. */
  end?: number;
  subject: Subject;
  values: Partial<Record<MetricKey, number | null>> | null;
};
export type MediaInterval = Range & {
  appId: string;
  title: string;
  artist: string;
  state: "playing" | "paused";
};
export type TimelineEvent = Range & {
  kind: "compile" | "download" | "sleep";
  title: string;
};
export type Capture = {
  kind?: "recorded";
  source?: string;
  initialView?: Range;
  maxSampleSpan?: number;
  metricOverrides?: Partial<Record<MetricKey, Partial<MetricInfo>>>;
  /** Host-provided hardware tracks; absent in the Web demo. */
  metricTracks?: { id: string; name: string; keys: MetricKey[]; details?: MetricKey[]; subtitle?: string; after?: string }[];
  epoch: string;
  bounds: Range;
  apps: Application[];
  activity: ActivityInterval[];
  afk: AfkInterval[];
  background: BackgroundLifetime[];
  metrics: MetricSample[];
  media: MediaInterval[];
  events: TimelineEvent[];
  samplePeriod: number;
};
export const sampleEnd = (sample: MetricSample, period: number) => sample.end ?? sample.time + period;
/** Samples are sorted by time, but need not be dense or start at the epoch. */
export function metricAt(data: Capture, time: number, key: MetricKey): number | null {
  let low = 0, high = data.metrics.length;
  while (low < high) { const mid = (low + high) >>> 1; if (data.metrics[mid].time <= time) low = mid + 1; else high = mid; }
  for (let i = low - 1; i >= 0; i--) {
    const sample = data.metrics[i];
    if (sample.time < time - (data.maxSampleSpan ?? data.samplePeriod)) break;
    const value = sample.values?.[key];
    if (sampleEnd(sample,data.samplePeriod) > time && value != null && Number.isFinite(value)) return value;
  }
  return null;
}
export interface DataProvider {
  load(): Promise<Capture>;
}
export const DAY = 86400;
export const overlap = (a: Range, b: Range) =>
  Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
export function clampRange(range: Range, bounds: Range): Range {
  const span = Math.min(
    bounds.end - bounds.start,
    Math.max(2, range.end - range.start),
  );
  const start = Math.max(
    bounds.start,
    Math.min(bounds.end - span, range.start),
  );
  return { start, end: start + span };
}
/** Move a viewport without changing its duration, except when bounds are smaller. */
export function followRange(view: Range, end: number, bounds: Range): Range {
  return clampRange({ start: end - (view.end - view.start), end }, bounds);
}
export function zoomRange(
  view: Range,
  factor: number,
  anchor: number,
  bounds: Range,
) {
  const fraction = (anchor - view.start) / (view.end - view.start);
  const span = Math.max(
    2,
    Math.min(bounds.end - bounds.start, (view.end - view.start) * factor),
  );
  return clampRange(
    { start: anchor - fraction * span, end: anchor + (1 - fraction) * span },
    bounds,
  );
}
export function duration(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
export function clock(time: number, seconds = false) {
  const t = Math.floor(((time % DAY) + DAY) % DAY);
  return [
    Math.floor(t / 3600),
    Math.floor((t % 3600) / 60),
    ...(seconds ? [t % 60] : []),
  ]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function dateLabel(time: number) {
  return `Oct ${8 + Math.floor(time / DAY)}`;
}
export function bytes(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}
export type MetricInfo = { name: string; color: string; max: number; unit: string; boolean?: boolean };
export const metricInfo: Record<Exclude<MetricKey, `gpu:${string}`>, MetricInfo> = {
  cpu: { name: "CPU", color: "#54bdd6", max: 100, unit: "%" },
  ram: { name: "Memory", color: "#5485df", max: 32, unit: "GB" },
  cpuFrequency: { name: "CPU frequency", color: "#9dacce", max: 6, unit: "GHz" },
  battery: { name: "Battery", color: "#83bc68", max: 100, unit: "%" },
  pluggedIn: { name: "Plugged in", color: "#d4ab72", max: 1, unit: "", boolean: true },
  charging: { name: "Charging", color: "#83bc68", max: 1, unit: "", boolean: true },
  gpu: { name: "GPU", color: "#d4ab72", max: 100, unit: "%" },
  download: { name: "Receive", color: "#d783c3", max: 32, unit: "MB/s" },
  upload: { name: "Send", color: "#d783c3", max: 32, unit: "MB/s" },
  read: { name: "Read", color: "#83bc68", max: 160, unit: "MB/s" },
  write: { name: "Write", color: "#83bc68", max: 160, unit: "MB/s" },
  audioInput: { name: "Audio input", color: "#71bcb1", max: 100, unit: "%" },
  audio: { name: "Audio", color: "#ae9bdd", max: 100, unit: "%" },
};
export function getMetricInfo(data: Capture | null | undefined, key: MetricKey) {
  return { ...(metricInfo[key as keyof typeof metricInfo] ?? { name: key, color: "#d4ab72", max: 100, unit: "%" }), ...data?.metricOverrides?.[key] };
}
