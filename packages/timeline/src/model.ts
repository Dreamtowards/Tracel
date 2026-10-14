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
  color: string;
  glyph: string;
};
export type ActivityContext = Range & {
  kind: "file" | "url" | "project";
  title: string;
  value: string;
};
export type ActivityInterval = Range & {
  id: string;
  appId: string;
  windowTitle: string;
  contexts: ActivityContext[];
};
export type AfkInterval = Range & { reason: string };
export type BackgroundLifetime = Range & { appId: string };
export type MetricKey =
  "cpu" | "ram" | "gpu" | "download" | "upload" | "read" | "write" | "audio";
export type MetricSample = {
  time: number;
  subject: Subject;
  values: Record<MetricKey, number> | null;
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
export const metricInfo: Record<
  MetricKey,
  { name: string; color: string; max: number; unit: string }
> = {
  cpu: { name: "CPU", color: "#54bdd6", max: 100, unit: "%" },
  ram: { name: "Memory", color: "#5485df", max: 32, unit: "GB" },
  gpu: { name: "GPU", color: "#d4ab72", max: 100, unit: "%" },
  download: { name: "Receive", color: "#d783c3", max: 32, unit: "MB/s" },
  upload: { name: "Send", color: "#d783c3", max: 32, unit: "MB/s" },
  read: { name: "Read", color: "#83bc68", max: 160, unit: "MB/s" },
  write: { name: "Write", color: "#83bc68", max: 160, unit: "MB/s" },
  audio: { name: "Audio", color: "#ae9bdd", max: 100, unit: "%" },
};
