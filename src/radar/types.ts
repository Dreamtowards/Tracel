export type VisitorStatus = "online" | "idle" | "offline";
export interface Location {
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
  | "session_start"
  | "page_view"
  | "navigation"
  | "idle"
  | "reactivated"
  | "session_end";
export interface JourneyEvent extends Page {
  id: string;
  visitorId: string;
  timestamp: number;
  type: JourneyType;
  previousPathname?: string;
  referrer?: string;
}
export interface Visitor {
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
  firstSeen: number;
  lastSeen: number;
  sessionStartedAt: number;
  journey: JourneyEvent[];
}
export type EventType =
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
  now: number;
}
export interface VisitorStream {
  subscribe(callback: (event: RadarEvent) => void): () => void;
}
