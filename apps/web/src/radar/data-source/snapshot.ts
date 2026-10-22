import type {
  Snapshot,
  StoredEvent,
  SessionRow,
} from "@tracel/radar-contracts";
import type {
  StreamSnapshot,
  Visitor,
  JourneyEvent,
  RadarEvent,
} from "../types";
export const emptySnapshot = (): StreamSnapshot => ({
  visitors: {},
  events: [],
  recentEventTimes: [],
  trafficRecords: [],
  now: Date.now(),
});
export function journeyEvent(e: StoredEvent): JourneyEvent {
  return {
    id: e.event_id,
    visitorId: e.visitor_id,
    timestamp: Date.parse(e.occurred_at),
    type: e.type,
    pathname: e.pathname,
    title: e.name || e.pathname,
    name: e.name || undefined,
    properties: e.properties,
  };
}
export function toStream(data: Snapshot): StreamSnapshot {
  const visitors: Record<string, Visitor> = {};
  for (const s of data.sessions) {
    const geo = s as SessionRow & {
      latitude?: number | null;
      longitude?: number | null;
    };
    visitors[s.session_id] = {
      id: s.session_id,
      anonymousId: s.visitor_id,
      location: {
        city: s.city || "Unknown",
        country: s.country || "Unknown",
        countryCode: s.country || "--",
        latitude: geo.latitude ?? 0,
        longitude: geo.longitude ?? 0,
        available: geo.latitude != null && geo.longitude != null,
        timezone: "Approximate location",
      },
      client: {
        browser: "Not collected",
        browserVersion: "",
        os: "Not collected",
        device: "Unknown",
        screenWidth: 0,
        screenHeight: 0,
        viewportWidth: 0,
        viewportHeight: 0,
        devicePixelRatio: 0,
        language: "Unknown",
      },
      acquisition: { referrer: null, source: "Unknown" },
      currentPage: { pathname: s.pathname, title: s.pathname },
      status:
        data.summary.now - Date.parse(s.last_seen) < 60_000
          ? "online"
          : "offline",
      firstSeen: Date.parse(s.started_at),
      lastSeen: Date.parse(s.last_seen),
      sessionStartedAt: Date.parse(s.started_at),
      journey: data.events
        .filter((e) => e.session_id === s.session_id)
        .reverse()
        .map(journeyEvent),
    };
  }
  const events: RadarEvent[] = data.events.flatMap((e) => {
    const visitor = visitors[e.session_id];
    if (!visitor) return [];
    if (e.referrer)
      visitor.acquisition = {
        referrer: e.referrer,
        source: new URL(e.referrer).hostname,
      };
    return [
      {
        id: e.event_id,
        timestamp: Date.parse(e.occurred_at),
        type: e.type,
        visitorId: visitor.id,
        visitor,
        journeyEvent: journeyEvent(e),
      },
    ];
  });
  return {
    visitors,
    events,
    recentEventTimes: events.map((e) => e.timestamp),
    trafficRecords: events
      .filter((e) => e.type === "page_view")
      .map((e) => ({
        visitorId: e.visitorId,
        location: e.visitor.location,
        timestamp: e.timestamp,
        type: "page_view",
      })),
    now: data.summary.now,
  };
}
