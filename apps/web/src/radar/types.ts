export type VisitorStatus = "online" | "idle" | "offline";
export interface Location {
  available?: boolean;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
}
export interface Page {
  pathname: string;
  title: string;
}
export type JourneyType =
  | "custom"
  | "session_start"
  | "page_view"
  | "navigation"
  | "idle"
  | "reactivated"
  | "session_end";
export interface JourneyEvent extends Page {
  name?: string;
  properties?: Record<string, string | number | boolean | null>;
  id: string;
  visitorId: string;
  timestamp: number;
  type: JourneyType;
  previousPathname?: string;
  referrer?: string;
}
export interface Visitor {
  anonymousId?: string;
  id: string;
  location: Location;
  client: {
    browser: string;
    browserVersion: string;
    os: string;
    osVersion?: string;
    device: string;
    screenWidth: number;
    screenHeight: number;
    viewportWidth: number;
    viewportHeight: number;
    devicePixelRatio: number;
    language: string;
  };
  acquisition: { referrer: string | null; source: string };
  currentPage: Page;
  status: VisitorStatus;
  visitCount?: number;
  previousSessionDurationMs?: number;
  firstSeen: number;
  lastSeen: number;
  sessionStartedAt: number;
  journey: JourneyEvent[];
}
export type EventType =
  | "custom"
  | "visitor_joined"
  | "page_view"
  | "navigation"
  | "visitor_idle"
  | "visitor_reactivated"
  | "visitor_left";
export interface RadarEvent {
  id: string;
  timestamp: number;
  type: EventType;
  visitorId: string;
  visitor: Visitor;
  journeyEvent: JourneyEvent;
}
export interface StreamSnapshot {
  visitors: Record<string, Visitor>;
  events: RadarEvent[];
  recentEventTimes: number[];
  trafficRecords: TrafficRecord[];
  now: number;
}
export interface TrafficRecord {
  visitorId?: string;
  location?: Location;
  timestamp: number;
  type: "visitor_joined" | "visitor_left" | "page_view" | "navigation";
}
export interface TrafficBucket {
  timestamp: number;
  pageViews: number;
  visitors: number;
}
export interface VisitorStream {
  subscribe(callback: (event: RadarEvent) => void): () => void;
}
