import type { TrafficBucket, TrafficRecord, Visitor } from "./types";

export const BUCKET_MS = 15000;
/** Compare page views and unique viewing visitors over the same 15-second bucket. */
export function trafficSeries(
  records: TrafficRecord[],
  _activeNow: number,
  now: number,
  windowMs = 600000,
): TrafficBucket[] {
  if (!now) return [];
  const last = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  const first = last - windowMs + BUCKET_MS;
  const buckets: TrafficBucket[] = [];
  for (let timestamp = first; timestamp <= last; timestamp += BUCKET_MS) {
    let pageViews = 0;
    const visitors = new Set<string>();
    records.forEach((record, index) => {
      if (
        record.timestamp > now ||
        record.timestamp < timestamp ||
        record.timestamp >= timestamp + BUCKET_MS
      )
        return;
      if (record.type === "page_view" || record.type === "navigation") {
        pageViews++;
        visitors.add(record.visitorId ?? `unknown-${index}`);
      }
    });
    buckets.push({ timestamp, pageViews, visitors: visitors.size });
  }
  return buckets;
}

export type RankingDimension =
  "country" | "city" | "browser" | "source" | "page";
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
            : dimension === "page"
              ? [visitor.currentPage.pathname, visitor.currentPage.pathname, ""]
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
