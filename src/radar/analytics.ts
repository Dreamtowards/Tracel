import type { TrafficBucket, TrafficRecord, Visitor } from "./types";

export const BUCKET_MS = 15000;
/** Page views include initial page loads and navigation, never lifecycle events.
 * Visitor values are concurrent presence (online + idle) at each bucket end. */
export function trafficSeries(
  records: TrafficRecord[],
  activeNow: number,
  now: number,
  windowMs = 600000,
): TrafficBucket[] {
  if (!now) return [];
  const last = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  const first = last - windowMs + BUCKET_MS;
  const buckets: TrafficBucket[] = [];
  for (let timestamp = first; timestamp <= last; timestamp += BUCKET_MS) {
    const end = Math.min(timestamp + BUCKET_MS, now);
    let visitors = activeNow;
    let pageViews = 0;
    for (const record of records) {
      if (record.timestamp > now) continue;
      if (record.timestamp > end) {
        if (record.type === "visitor_joined") visitors--;
        if (record.type === "visitor_left") visitors++;
      }
      if (
        record.timestamp >= timestamp &&
        record.timestamp < timestamp + BUCKET_MS &&
        (record.type === "page_view" || record.type === "navigation")
      )
        pageViews++;
    }
    buckets.push({ timestamp, pageViews, visitors: Math.max(0, visitors) });
  }
  return buckets;
}

export type RankingDimension = "country" | "city" | "browser" | "source";
export interface RankingRow {
  name: string;
  detail: string;
  count: number;
  percentage: number;
}
export function rankVisitors(
  visitors: Visitor[],
  dimension: RankingDimension,
): RankingRow[] {
  const active = visitors.filter((visitor) => visitor.status !== "offline");
  const groups = new Map<
    string,
    { name: string; detail: string; count: number }
  >();
  for (const visitor of active) {
    const [key, name, detail] =
      dimension === "country"
        ? [
            visitor.location.countryCode,
            visitor.location.country,
            visitor.location.countryCode,
          ]
        : dimension === "city"
          ? [
              `${visitor.location.countryCode}:${visitor.location.city}`,
              visitor.location.city,
              visitor.location.countryCode,
            ]
          : dimension === "browser"
            ? [visitor.client.browser, visitor.client.browser, ""]
            : [visitor.acquisition.source, visitor.acquisition.source, ""];
    const group = groups.get(key) ?? { name, detail, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((group) => ({
      ...group,
      percentage: active.length ? (group.count / active.length) * 100 : 0,
    }));
}
