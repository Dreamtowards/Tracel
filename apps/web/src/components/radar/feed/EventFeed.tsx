"use client";

import {
  ArrowUpRight,
  CornerDownRight,
  LogOut,
  Moon,
  Radio,
  ScanLine,
  Monitor,
  Smartphone,
} from "lucide-react";
import { useRadarStore } from "@/radar/store";
import { time, elapsed } from "@/radar/format";
import type { EventType, RadarEvent } from "@/radar/types";
import { useLayoutEffect, useRef, useState } from "react";

export const eventLabels: Record<EventType, string> = {
  visitor_joined: "VISITOR ARRIVED",
  page_view: "PAGE VIEW",
  navigation: "NAVIGATION",
  visitor_idle: "VISITOR IDLE",
  visitor_reactivated: "VISITOR ACTIVE",
  visitor_left: "VISITOR LEFT",
};
const eventIcons = {
  visitor_joined: ScanLine,
  page_view: ArrowUpRight,
  navigation: CornerDownRight,
  visitor_idle: Moon,
  visitor_reactivated: Radio,
  visitor_left: LogOut,
};

function EventItem({ event }: { event: RadarEvent }) {
  const selectedId = useRadarStore((state) => state.selectedVisitor?.id);
  const select = useRadarStore((state) => state.select);
  const Icon = eventIcons[event.type];
  const visitor = event.visitor;
  return (
    <button
      className={`event-item ${selectedId === visitor.id ? "is-selected" : ""} ${event.type === "visitor_left" ? "departed" : ""}`}
      onClick={() => select(visitor)}
      aria-label={`${eventLabels[event.type]}, ${visitor.location.city}, visitor ${visitor.id.slice(0, 6)}`}
    >
      <div className="event-top">
        <span
          className={`event-type ${event.type === "visitor_joined" ? "arrival" : ""}`}
        >
          <Icon size={12} />
          {eventLabels[event.type]}
        </span>
        <time dateTime={new Date(event.timestamp).toISOString()}>
          {time(event.timestamp)}
        </time>
      </div>
      <div className="event-location">
        <span className="country-code">{visitor.location.countryCode}</span>
        <strong>{visitor.location.city}</strong>
        <span className="visitor-short">{visitor.id.slice(0, 4)}</span>
      </div>
      <div className="event-client">
        {visitor.client.browser} <span>·</span> {visitor.client.os}{" "}
        <span className="source-name">{visitor.acquisition.source}</span>
      </div>
      <div className="event-path">
        <CornerDownRight size={13} />
        <span>{visitor.currentPage.pathname}</span>
      </div>
    </button>
  );
}

export function EventFeed() {
  const [tab, setTab] = useState<"events" | "visitors">("events");
  const events = useRadarStore((state) => state.events);
  const visitors = useRadarStore((state) => state.visitors);
  const paused = useRadarStore((state) => state.paused);
  const selectedId = useRadarStore((state) => state.selectedVisitor?.id);
  const now = useRadarStore((state) => state.now);
  const select = useRadarStore((state) => state.select);
  const active = Object.values(visitors)
    .filter((v) => v.status !== "offline")
    .sort((a, b) => b.lastSeen - a.lastSeen);
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    following.current = true;
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [tab]);
  useLayoutEffect(() => {
    if (following.current && scroll.current) scroll.current.scrollTop = 0;
  }, [events[0]?.id]);
  return (
    <aside className="event-panel" aria-label="Live events and visitors">
      <div className="panel-heading">
        <div>
          <h2>
            Live events{" "}
            <span className={`status-dot ${paused ? "paused" : ""}`} />
          </h2>
        </div>
      </div>
      <div
        className="feed-tabs"
        role="tablist"
        aria-label="Activity view"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            setTab(tab === "events" ? "visitors" : "events");
            (
              event.currentTarget.querySelector(
                `[id="${tab === "events" ? "visitors" : "events"}-tab"]`,
              ) as HTMLElement
            )?.focus();
          }
        }}
      >
        <button
          id="events-tab"
          role="tab"
          aria-selected={tab === "events"}
          aria-controls="events-content"
          tabIndex={tab === "events" ? 0 : -1}
          className={tab === "events" ? "active" : ""}
          onClick={() => setTab("events")}
        >
          Events <span>{events.length}</span>
        </button>
        <button
          id="visitors-tab"
          role="tab"
          aria-selected={tab === "visitors"}
          aria-controls="visitors-content"
          tabIndex={tab === "visitors" ? 0 : -1}
          className={tab === "visitors" ? "active" : ""}
          onClick={() => setTab("visitors")}
        >
          Visitors <span>{active.length}</span>
        </button>
      </div>
      <div
        className="feed-scroll"
        ref={scroll}
        onScroll={(event) => {
          following.current = event.currentTarget.scrollTop < 20;
        }}
        role="tabpanel"
        id={`${tab}-content`}
        aria-labelledby={`${tab}-tab`}
        tabIndex={0}
      >
        {tab === "events"
          ? events
              .slice(0, 40)
              .map((event) => <EventItem key={event.id} event={event} />)
          : active.map((visitor) => (
              <button
                key={visitor.id}
                className={`visitor-row ${selectedId === visitor.id ? "is-selected" : ""}`}
                onClick={() => select(visitor)}
                aria-label={`View visitor ${visitor.id.slice(0, 6)} in ${visitor.location.city}`}
              >
                <span
                  className={`status-dot ${visitor.status === "idle" ? "idle" : ""}`}
                />
                <span className="visitor-row-body">
                  <strong>
                    {visitor.location.city}
                    <small>
                      {visitor.location.countryCode} / {visitor.id.slice(0, 6)}
                    </small>
                  </strong>
                  <span>{visitor.currentPage.pathname}</span>
                </span>
                <span className="visitor-row-device">
                  {visitor.client.device === "Mobile" ? (
                    <Smartphone size={14} />
                  ) : (
                    <Monitor size={14} />
                  )}
                  <small>{elapsed(now - visitor.sessionStartedAt)}</small>
                </span>
              </button>
            ))}
        {((tab === "events" && events.length === 0) ||
          (tab === "visitors" && active.length === 0)) && (
          <div className="feed-empty">
            <Radio size={24} />
            <p>
              {tab === "events" ? "Waiting for events" : "No visitors online"}
            </p>
            <span>The observation continues.</span>
          </div>
        )}
      </div>
      <div className="feed-footer">
        <span className={`status-dot ${paused ? "paused" : ""}`} />
        {paused ? "STREAM PAUSED" : "LISTENING FOR EVENTS"}
        <span className="mono">LOCAL DEMO</span>
      </div>
    </aside>
  );
}
