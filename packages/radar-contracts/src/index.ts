export const ONLINE_MS = 60_000;
export const MAX_BODY = 16_384;
export type Properties = Record<string, string | number | boolean | null>;
export interface CollectEvent {
  schemaVersion: 1;
  eventId: string;
  siteKey: string;
  visitorId: string;
  sessionId: string;
  occurredAt: number;
  type: "page_view" | "heartbeat" | "custom";
  pathname: string;
  name?: string;
  properties?: Properties;
  referrer?: string;
}
export interface Site {
  id: string;
  site_key: string;
  name: string;
  domains: string[];
  public_enabled: boolean;
  theme: "dark" | "light";
}
export interface StoredEvent {
  event_id: string;
  visitor_id: string;
  session_id: string;
  occurred_at: string;
  received_at: string;
  type: "page_view" | "custom";
  pathname: string;
  name: string | null;
  properties: Properties;
  referrer: string | null;
  country: string | null;
  city: string | null;
}
export interface SessionRow {
  session_id: string;
  visitor_id: string;
  started_at: string;
  last_seen: string;
  pathname: string;
  country: string | null;
  city: string | null;
}
export interface Summary {
  online: number;
  pageViews: number;
  visitors: number;
  now: number;
}
export interface Snapshot {
  summary: Summary;
  sessions: SessionRow[];
  events: StoredEvent[];
  pages: { name: string; count: number }[];
  sources: { name: string; count: number }[];
  countries: { name: string; count: number }[];
  cities: { name: string; count: number }[];
  truncated: boolean;
}
const id = /^[a-zA-Z0-9_-]{8,80}$/;
export function normalizePath(value: string): string {
  const path = value.split(/[?#]/)[0];
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.length > 512 ||
    /[\x00-\x1f\\]/.test(path)
  )
    throw new Error("invalid_path");
  return path;
}
export function parseEvent(value: unknown, now = Date.now()): CollectEvent {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_event");
  const e = value as Record<string, unknown>;
  if (e.schemaVersion !== 1) throw new Error("unsupported_version");
  for (const field of ["eventId", "siteKey", "visitorId", "sessionId"])
    if (typeof e[field] !== "string" || !id.test(e[field] as string))
      throw new Error("invalid_identifier");
  if (!["page_view", "heartbeat", "custom"].includes(String(e.type)))
    throw new Error("invalid_type");
  if (
    typeof e.occurredAt !== "number" ||
    !Number.isSafeInteger(e.occurredAt) ||
    e.occurredAt > now + 300_000 ||
    e.occurredAt < now - 86_400_000
  )
    throw new Error("invalid_timestamp");
  if (typeof e.pathname !== "string") throw new Error("invalid_path");
  const pathname = normalizePath(e.pathname);
  let referrer: string | undefined;
  if (e.referrer) {
    const url = new URL(String(e.referrer));
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("invalid_referrer");
    referrer = url.origin;
  }
  const properties: Properties = Object.create(null);
  if (e.properties !== undefined) {
    if (
      !e.properties ||
      typeof e.properties !== "object" ||
      Array.isArray(e.properties)
    )
      throw new Error("invalid_properties");
    const entries = Object.entries(e.properties);
    if (entries.length > 16) throw new Error("too_many_properties");
    for (const [key, val] of entries) {
      if (
        !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) ||
        /email|password|token|secret|phone|address|name|url|query|input/i.test(
          key,
        )
      )
        throw new Error("invalid_property_key");
      if (
        !(
          val === null ||
          typeof val === "boolean" ||
          (typeof val === "number" && Number.isFinite(val)) ||
          (typeof val === "string" && val.length <= 160)
        )
      )
        throw new Error("invalid_property_value");
      properties[key] = val;
    }
  }
  if (
    e.type === "custom" &&
    (typeof e.name !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(e.name))
  )
    throw new Error("invalid_event_name");
  return {
    schemaVersion: 1,
    eventId: e.eventId as string,
    siteKey: e.siteKey as string,
    visitorId: e.visitorId as string,
    sessionId: e.sessionId as string,
    occurredAt: e.occurredAt,
    type: e.type as CollectEvent["type"],
    pathname,
    referrer,
    ...(e.type === "custom" ? { name: e.name as string, properties } : {}),
  };
}
export function parseDomains(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10)
    throw new Error("invalid_domains");
  return [
    ...new Set(
      value.map((v) => {
        if (typeof v !== "string" || v.length > 253 || /[/:?#@\s]/.test(v))
          throw new Error("invalid_domain");
        const host = new URL(`https://${v}`).hostname;
        if (
          host !== v.toLowerCase() ||
          (!host.includes(".") && host !== "localhost") ||
          host
            .split(".")
            .some(
              (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
            )
        )
          throw new Error("invalid_domain");
        return host;
      }),
    ),
  ];
}
