import { clampRange, type Range } from "@tracel/timeline/model";

export function quotaDateKey(milliseconds: number) {
  const date = new Date(milliseconds);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Calendar days use local midnight, including short/long daylight-saving days. */
export function quotaDayRange(value: string, epoch: string, bounds: Range): Range {
  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(year, month - 1, day), end = new Date(year, month - 1, day + 1);
  const origin = Date.parse(epoch);
  return clampRange({ start: Math.max(bounds.start, (start.getTime() - origin) / 1000), end: Math.min(bounds.end, (end.getTime() - origin) / 1000) }, bounds);
}

export function quotaDuration(seconds: number) {
  if (seconds < 60) return "不足1分钟";
  const minutes = Math.round(seconds / 60), days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  return [days ? `${days}天` : "", hours ? `${hours}小时` : "", rest ? `${rest}分` : ""].filter(Boolean).join(" ");
}

export function quotaRangeLabel(epoch: string, range: Range) {
  const origin = Date.parse(epoch), startMs = origin + range.start * 1000, endMs = origin + range.end * 1000;
  const start = new Date(startMs), end = new Date(endMs);
  const sameDay = quotaDateKey(startMs) === quotaDateKey(endMs - 1);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", ...(start.getFullYear() !== end.getFullYear() ? { year: "numeric" } : {}) };
  const date = (value: Date) => value.toLocaleDateString("zh-CN", options);
  const clock = (value: Date) => value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const endClock = sameDay && quotaDateKey(endMs) !== quotaDateKey(startMs) ? "24:00" : clock(end);
  return `${date(start)} ${clock(start)} — ${sameDay ? "" : `${date(end)} `}${endClock}`;
}
