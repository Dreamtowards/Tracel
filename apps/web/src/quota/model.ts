import { metricAt, type Capture, type MetricKey } from "@tracel/timeline/model";

export type QuotaAccount = {
  id: string; name: string; provider: string; plan: string;
  status: "enabled" | "draining" | "disabled";
  resetsRemaining?: number;
  /** Earliest expiry among currently available Reset credits, in UTC milliseconds. */
  resetExpiresAtMs?: number;
};
export type QuotaTrack = {
  id: string; accountId: string; name: string; unit: "%" | "CNY" | "credits";
  max: number; color: string; capacity?: number; capacityUnit?: string;
};
export type QuotaDataset = {
  mode: "demo" | "connected"; label: string;
  startMs: number; endMs: number; samplePeriodSeconds: number;
  accounts: QuotaAccount[]; tracks: QuotaTrack[];
  /** UTC milliseconds. Each sample stores readings, never repeated account metadata. */
  samples: { at: number; values: Record<string, number | null> }[];
  resets: { id: string; trackId: string; at: number; kind: "confirmed" | "projected" }[];
};
export interface QuotaDataSource { load(): Promise<QuotaDataset> }
export const quotaKey = (id: string): MetricKey => `metric:${id}`;
export const accountStatus = { enabled: "启用", draining: "排空", disabled: "禁用" };
export const quotaAccountName = (account: QuotaAccount) => [account.name, account.plan].filter(Boolean).join(" ");
/** One compact duration convention for both cycle resets and Reset-credit expiry. */
export function quotaTimeLeft(at: number, now: number) {
  const remaining = Math.max(0, at - now);
  const days = remaining / 86400000, hours = remaining / 3600000;
  if (days >= 1) return `${days.toFixed(1)}天`;
  if (hours >= 1) return `${hours.toFixed(1)}小时`;
  return `${Math.ceil(remaining / 60000)}分钟`;
}
export function quotaDeadlineTone(at: number | undefined, now: number) {
  if (at === undefined) return "muted";
  const hours = (at - now) / 3600000;
  return hours <= 5 ? "critical" : hours <= 24 ? "soon" : hours <= 48 ? "upcoming" : "muted";
}
export const quotaValue = (value: number | null, track: QuotaTrack) => value === null ? "暂无读数"
  : track.unit === "%" ? `${value.toFixed(1)}%`
  : `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ${track.unit}`;

/** The source adapter is the only boundary between quota records and shared Timeline. */
export function quotaCapture(dataset: QuotaDataset): Capture {
  const epochMs = dataset.startMs;
  const bounds = { start: 0, end: (dataset.endMs - epochMs) / 1000 };
  const capture: Capture = {
    kind: "recorded", source: dataset.label, epoch: new Date(epochMs).toISOString(), bounds,
    samplePeriod: dataset.samplePeriodSeconds, maxSampleSpan: dataset.samplePeriodSeconds,
    initialView: { start: Math.max(0, bounds.end - 86400), end: bounds.end },
    apps: [], activity: [], afk: [], background: [], media: [], events: [],
    metrics: dataset.samples.map(sample => ({
      time: (sample.at - epochMs) / 1000, subject: { kind: "system" as const, id: "quota" },
      values: Object.fromEntries(Object.entries(sample.values).map(([id, value]) => [quotaKey(id), value])),
    })),
    metricOverrides: Object.fromEntries(dataset.tracks.map(track => [quotaKey(track.id), {
      name: track.name, unit: track.unit, max: track.max, color: track.color,
    }])),
    metricGroups: [],
    metricMarkers: dataset.resets.map(reset => ({
      id: reset.id, key: quotaKey(reset.trackId), time: (reset.at - epochMs) / 1000,
      kind: reset.kind, label: reset.kind === "confirmed" ? "已重置" : "预计重置",
    })),
  };
  capture.metricGroups = dataset.accounts.map(account => ({
    id: `account:${account.id}`, name: quotaAccountName(account),
    subtitle: [account.plan, accountStatus[account.status], ...(account.resetsRemaining !== undefined ? [`Reset ${account.resetsRemaining} 次`] : [])].filter(Boolean).join(" · "),
    tracks: dataset.tracks.filter(track => track.accountId === account.id).map(track => ({
      id: track.id, name: track.name, keys: [quotaKey(track.id)],
      subtitle: `剩余 ${quotaValue(metricAt(capture, bounds.end - .001, quotaKey(track.id)), track)}`,
    })),
  }));
  return capture;
}
