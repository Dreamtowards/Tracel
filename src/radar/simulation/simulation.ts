import { cities, clients, pages, referrers } from "./data";
import type {
  EventType,
  JourneyEvent,
  JourneyType,
  RadarEvent,
  StreamSnapshot,
  TrafficRecord,
  Visitor,
  VisitorStream,
} from "../types";

const journeyTypes: Record<EventType, JourneyType> = {
  visitor_joined: "session_start",
  page_view: "page_view",
  navigation: "navigation",
  visitor_idle: "idle",
  visitor_reactivated: "reactivated",
  visitor_left: "session_end",
};
const FEED_LIMIT = 80;

/** Independent, deterministic event source. No React, browser or store dependency. */
export class MockVisitorStream implements VisitorStream {
  private randomState: number;
  private sequence = 0;
  private visitors: Record<string, Visitor> = {};
  private events: RadarEvent[] = [];
  private recentEventTimes: number[] = [];
  private trafficRecords: TrafficRecord[] = [];
  private nextActions = new Map<string, number>();
  private listeners = new Set<(event: RadarEvent) => void>();
  private nextSpawn: number;
  now: number;

  constructor(now = Date.now(), seed = 42, count = 12) {
    this.now = now;
    this.randomState = seed;
    this.nextSpawn = now + 6500;
    for (let i = 0; i < count; i++) this.spawn(true);
    this.events.sort((a, b) => b.timestamp - a.timestamp);
  }

  private random() {
    this.randomState =
      (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  private pick<T>(values: T[]): T {
    return values[Math.floor(this.random() * values.length)];
  }
  private wait(min = 3000, max = 8000) {
    return min + this.random() * (max - min);
  }
  private id() {
    return (++this.sequence).toString(16).padStart(6, "0").toUpperCase();
  }

  subscribe(callback: (event: RadarEvent) => void) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  snapshot(): StreamSnapshot {
    return {
      visitors: { ...this.visitors },
      events: [...this.events],
      recentEventTimes: this.recentEventTimes.filter(
        (at) => at > this.now - 60000 && at <= this.now,
      ),
      trafficRecords: this.trafficRecords.filter(
        (record) =>
          record.timestamp >= Math.floor((this.now - 600000) / 15000) * 15000,
      ),
      now: this.now,
    };
  }

  private emit(
    visitor: Visitor,
    type: EventType,
    timestamp: number,
    pathname = visitor.currentPage.pathname,
  ) {
    const page =
      pages.find((p) => p.pathname === pathname) ?? visitor.currentPage;
    const journeyEvent: JourneyEvent = {
      id: this.id(),
      visitorId: visitor.id,
      timestamp,
      type: journeyTypes[type],
      ...page,
      ...(type === "navigation"
        ? { previousPathname: visitor.currentPage.pathname }
        : {}),
      ...(type === "visitor_joined" && visitor.acquisition.referrer
        ? { referrer: visitor.acquisition.referrer }
        : {}),
    };
    const updated: Visitor = {
      ...visitor,
      currentPage: page,
      lastSeen: timestamp,
      status:
        type === "visitor_left"
          ? "offline"
          : type === "visitor_idle"
            ? "idle"
            : "online",
      journey: [...visitor.journey, journeyEvent].slice(-64),
    };
    this.visitors[visitor.id] = updated;
    const event: RadarEvent = {
      id: journeyEvent.id,
      timestamp,
      type,
      visitorId: visitor.id,
      visitor: updated,
      journeyEvent,
    };
    this.events = [event, ...this.events].slice(0, FEED_LIMIT);
    this.recentEventTimes.push(timestamp);
    if (
      type === "visitor_joined" ||
      type === "visitor_left" ||
      type === "page_view" ||
      type === "navigation"
    ) {
      this.trafficRecords.push({
        visitorId: visitor.id,
        timestamp,
        type,
        location: { ...visitor.location },
      });
    }
    this.listeners.forEach((listener) => listener(event));
    return updated;
  }

  spawn(initial = false) {
    const firstSeen = initial ? this.now - this.wait(20000, 120000) : this.now;
    // Sequential city assignment gives the initial view geographic variety.
    const location = initial
      ? cities[Object.keys(this.visitors).length % cities.length]
      : this.pick(cities);
    const entry = this.random() < 0.65 ? pages[0] : this.pick(pages);
    let visitor: Visitor = {
      id:
        Math.floor(this.random() * 0xffffff)
          .toString(16)
          .padStart(6, "0")
          .toUpperCase() + this.id().slice(-2),
      location: { ...location },
      client: { ...this.pick(clients) },
      acquisition: { ...this.pick(referrers) },
      currentPage: entry,
      status: "online",
      firstSeen,
      lastSeen: firstSeen,
      sessionStartedAt: firstSeen,
      journey: [],
    };
    visitor = this.emit(visitor, "visitor_joined", firstSeen);
    visitor = this.emit(visitor, "page_view", firstSeen + (initial ? 800 : 0));
    if (initial) {
      const count = Math.floor(this.random() * 5) + 3;
      for (let step = 0; step < count; step++) {
        const timestamp =
          firstSeen +
          ((this.now - firstSeen - 2000) * (step + 1)) / (count + 1);
        visitor = this.emit(
          visitor,
          "navigation",
          timestamp,
          this.nextPage(visitor),
        );
      }
      if (this.random() < 0.16)
        visitor = this.emit(visitor, "visitor_idle", this.now - 1000);
    }
    this.nextActions.set(visitor.id, this.now + this.wait());
    return visitor;
  }

  private nextPage(visitor: Visitor) {
    const path = visitor.currentPage.pathname;
    const options =
      path === "/"
        ? [pages[1], pages[5], pages[7]]
        : path === "/blog"
          ? pages.slice(2, 5)
          : path === "/projects"
            ? [pages[6], pages[7]]
            : pages.filter((p) => p.pathname !== path);
    return this.pick(options).pathname;
  }

  /** Advance in simulated milliseconds. All transitions share this clock. */
  advance(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    const target = this.now + milliseconds;
    let steps = 0;
    while (steps++ < 4096) {
      let nextTime = this.nextSpawn;
      let nextId: string | null = null;
      for (const [id, at] of this.nextActions)
        if (at < nextTime) {
          nextTime = at;
          nextId = id;
        }
      if (nextTime > target) break;
      this.now = nextTime;
      if (nextId) {
        const visitor = this.visitors[nextId];
        if (!visitor || visitor.status === "offline") {
          this.nextActions.delete(nextId);
          continue;
        }
        const age = this.now - visitor.firstSeen;
        if (age > 240000 || (age > 70000 && this.random() < 0.18)) {
          this.emit(visitor, "visitor_left", this.now);
          this.nextActions.delete(nextId);
        } else if (visitor.status === "idle") {
          this.emit(visitor, "visitor_reactivated", this.now);
          this.nextActions.set(nextId, this.now + this.wait());
        } else {
          const type = this.random() < 0.17 ? "visitor_idle" : "navigation";
          this.emit(
            visitor,
            type,
            this.now,
            type === "navigation" ? this.nextPage(visitor) : undefined,
          );
          this.nextActions.set(
            nextId,
            this.now +
              (type === "visitor_idle" ? this.wait(12000, 30000) : this.wait()),
          );
        }
      } else {
        if (
          Object.values(this.visitors).filter((v) => v.status !== "offline")
            .length < 40
        )
          this.spawn();
        this.nextSpawn = this.now + this.wait(7000, 16000);
      }
    }
    this.now = target;
    for (const visitor of Object.values(this.visitors)) {
      if (visitor.status === "offline" && this.now - visitor.lastSeen > 45000)
        delete this.visitors[visitor.id];
    }
    this.events = this.events.slice(0, FEED_LIMIT);
    this.recentEventTimes = this.recentEventTimes.filter(
      (at) => at > this.now - 60000,
    );
    this.trafficRecords = this.trafficRecords.filter(
      (record) =>
        record.timestamp >= Math.floor((this.now - 600000) / 15000) * 15000,
    );
  }
}
