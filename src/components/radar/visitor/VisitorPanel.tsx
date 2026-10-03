"use client";

import {
  X,
  Globe2,
  Monitor,
  Smartphone,
  CornerDownRight,
  ExternalLink,
  Route,
  Moon,
  LogOut,
  Radio,
  Circle,
} from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useRadarStore } from "@/radar/store";
import { time, duration, coordinate, elapsed } from "@/radar/format";
import type { JourneyType } from "@/radar/types";

const journeyLabels: Record<JourneyType, string> = {
  session_start: "Session started",
  page_view: "Page view",
  navigation: "Navigation",
  idle: "Visitor idle",
  reactivated: "Visitor active",
  session_end: "Session ended",
};
const journeyIcons = {
  session_start: Circle,
  page_view: CornerDownRight,
  navigation: CornerDownRight,
  idle: Moon,
  reactivated: Radio,
  session_end: LogOut,
};

export function VisitorPanel() {
  const visitor = useRadarStore((state) => state.selectedVisitor);
  const now = useRadarStore((state) => state.now);
  const select = useRadarStore((state) => state.select);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") select(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [select]);
  useEffect(() => {
    if (visitor)
      document.getElementById("close-visitor")?.focus({ preventScroll: true });
  }, [visitor?.id]);
  if (!visitor) return null;
  const client = visitor.client;
  const sessionNow = visitor.status === "offline" ? visitor.lastSeen : now;
  return (
    <aside className="detail-panel" aria-labelledby="visitor-heading">
      <div className="detail-heading">
        <span className="eyebrow">VISITOR DETAILS</span>
        <Button
          id="close-visitor"
          variant="ghost"
          size="icon"
          aria-label="Close visitor details"
          onClick={() => select(null)}
        >
          <X size={17} />
        </Button>
      </div>
      <div className="detail-scroll" key={visitor.id}>
        <div className="visitor-identity">
          <h2 id="visitor-heading">
            {visitor.id.slice(0, 6)}
            <span className="hash-mark">#</span>
          </h2>
          <span className={`visitor-status ${visitor.status}`}>
            <span className={`status-dot ${visitor.status}`} />
            {visitor.status.toUpperCase()}
          </span>
        </div>
        <div className="session-line">
          <span>
            SESSION <b>{duration(sessionNow - visitor.sessionStartedAt)}</b>
          </span>
          <span>
            FIRST SEEN <b>{time(visitor.firstSeen)}</b>
          </span>
        </div>
        <section className="detail-section">
          <h3>
            <Globe2 size={13} />
            LOCATION
          </h3>
          <div className="location-title">
            {visitor.location.city}
            <span>{visitor.location.country}</span>
          </div>
          <div className="location-coordinates mono">
            <span>{coordinate(visitor.location.latitude, true)}</span>
            <span>{coordinate(visitor.location.longitude, false)}</span>
          </div>
          <p className="secondary mono">{visitor.location.timezone}</p>
        </section>
        <section className="detail-section">
          <h3>
            {client.device === "Mobile" ? (
              <Smartphone size={13} />
            ) : (
              <Monitor size={13} />
            )}
            CLIENT
          </h3>
          <div className="client-primary">
            <span>
              {client.browser} {client.browserVersion}
            </span>
            <span>
              {client.os} {client.osVersion}
            </span>
          </div>
          <dl className="client-properties">
            <div>
              <dt>Device</dt>
              <dd>{client.device}</dd>
            </div>
            <div>
              <dt>Screen</dt>
              <dd>
                {client.screenWidth} × {client.screenHeight}
              </dd>
            </div>
            <div>
              <dt>Viewport</dt>
              <dd>
                {client.viewportWidth} × {client.viewportHeight}
              </dd>
            </div>
            <div>
              <dt>Pixel ratio / Language</dt>
              <dd>
                {client.devicePixelRatio} / {client.language}
              </dd>
            </div>
          </dl>
        </section>
        <section className="detail-section acquisition-section">
          <div>
            <h3>
              <ExternalLink size={13} />
              SOURCE
            </h3>
            <p>{visitor.acquisition.source}</p>
            {visitor.acquisition.referrer && (
              <span className="referrer-url mono">
                {new URL(visitor.acquisition.referrer).hostname}
              </span>
            )}
          </div>
          <div>
            <h3>
              <CornerDownRight size={13} />
              CURRENT PAGE
            </h3>
            <p className="current-page mono">{visitor.currentPage.pathname}</p>
            <span className="secondary">{visitor.currentPage.title}</span>
          </div>
        </section>
        <section className="detail-section journey-section">
          <h3>
            <Route size={13} />
            JOURNEY{" "}
            <span>
              {visitor.journey.length.toString().padStart(2, "0")} EVENTS
            </span>
          </h3>
          <ol className="journey-list">
            {visitor.journey.map((event, index) => {
              const Icon = journeyIcons[event.type];
              const isPage =
                event.type === "page_view" || event.type === "navigation";
              const current = index === visitor.journey.length - 1;
              const next = visitor.journey[index + 1];
              return (
                <li key={event.id} className={current ? "current" : ""}>
                  <span className="journey-node">
                    <Icon size={12} />
                  </span>
                  <div className="journey-top">
                    <time className="mono">{time(event.timestamp)}</time>
                    {current && (
                      <span className="current-tag">
                        {visitor.status === "offline" ? "ENDED" : "LATEST"}
                      </span>
                    )}
                  </div>
                  <strong className={isPage ? "mono" : ""}>
                    {isPage ? event.pathname : journeyLabels[event.type]}
                  </strong>
                  <span className="journey-description">
                    {isPage
                      ? event.title
                      : event.type === "session_start"
                        ? visitor.acquisition.source
                        : event.type === "idle"
                          ? "No recent activity"
                          : event.type === "reactivated"
                            ? "Activity resumed"
                            : "Visitor disconnected"}
                  </span>
                  {next && (
                    <span className="journey-dwell mono">
                      + {elapsed(next.timestamp - event.timestamp)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
      <div className="detail-footer mono">
        VISITOR / {visitor.id} <span>ESC TO CLOSE</span>
      </div>
    </aside>
  );
}
