"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Crosshair,
  Globe2,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventFeed } from "./feed/EventFeed";
import { VisitorPanel } from "./visitor/VisitorPanel";
import { useRadarStore } from "@/radar/store";
import { useSimulation } from "@/radar/use-simulation";
import { time } from "@/radar/format";

const Globe = dynamic(() => import("./globe/Globe"), {
  ssr: false,
  loading: () => (
    <div className="globe-loading">
      <ScanLine size={28} />
      <span>INITIALIZING OBSERVATION</span>
    </div>
  ),
});

function Clock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <span className="utc-clock mono">
      {now ? time(now) : "--:--:--"}
      <span>UTC</span>
    </span>
  );
}

function Metrics() {
  const visitors = useRadarStore((state) => state.visitors);
  const eventTimes = useRadarStore((state) => state.recentEventTimes);
  const now = useRadarStore((state) => state.now);
  const paused = useRadarStore((state) => state.paused);
  const active = Object.values(visitors).filter((v) => v.status !== "offline");
  const online = active.filter((v) => v.status === "online").length;
  const countries = new Set(active.map((v) => v.location.countryCode)).size;
  const minuteEvents = eventTimes.filter((at) => at <= now && at > now - 60000);
  const bars = useMemo(
    () =>
      Array.from(
        { length: 24 },
        (_, i) =>
          eventTimes.filter(
            (at) => at > now - (24 - i) * 2500 && at <= now - (23 - i) * 2500,
          ).length,
      ),
    [eventTimes, now],
  );
  return (
    <div className="telemetry" aria-label="Live telemetry">
      <div className="metric">
        <span className="metric-label">
          <ScanLine size={13} />
          VISITORS
        </span>
        <div className="metric-value">
          {active.length.toString().padStart(2, "0")}
          <span className="metric-caption">
            <i />
            {online} active <span>· {active.length - online} idle</span>
          </span>
        </div>
      </div>
      <div className="metric">
        <span className="metric-label">
          <Activity size={13} />
          EVENTS / MIN
        </span>
        <div className="metric-value">
          {minuteEvents.length.toString().padStart(2, "0")}
          <div className="event-spark" aria-hidden="true">
            {bars.map((value, i) => (
              <i
                key={i}
                style={{ height: `${Math.max(3, Math.min(30, value * 5))}px` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="metric">
        <span className="metric-label">
          <Globe2 size={13} />
          COUNTRIES
        </span>
        <div className="metric-value">
          {countries.toString().padStart(2, "0")}
          <span className="metric-caption">Across the globe</span>
        </div>
      </div>
      <div className="metric metric-status">
        <span className="metric-label">OBSERVATION STATUS</span>
        <div className="metric-value status-value">
          <span className={`status-dot ${paused ? "paused" : ""}`} />
          {paused ? "Paused" : "Live"}
          <span className="metric-caption">
            {paused ? "Simulation on hold" : "Receiving events"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RadarView() {
  const { reset, spawn } = useSimulation();
  const selected = useRadarStore((state) => state.selectedVisitor);
  const paused = useRadarStore((state) => state.paused);
  const speed = useRadarStore((state) => state.speed);
  const setPaused = useRadarStore((state) => state.setPaused);
  const setSpeed = useRadarStore((state) => state.setSpeed);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const change = () => setReducedMotion(query.matches);
    query.addEventListener("change", change);
    const fullscreen = () => setFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fullscreen);
    return () => {
      query.removeEventListener("change", change);
      document.removeEventListener("fullscreenchange", fullscreen);
    };
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice(
        "Fullscreen is unavailable in this preview. Open the page in a browser to use it.",
      );
    }
  }
  return (
    <div className={`radar-app ${selected ? "visitor-selected" : ""}`}>
      <header className="app-header">
        <a className="brand" href="/" aria-label="Tracel home">
          <span className="brand-symbol">
            <Crosshair size={25} strokeWidth={1.3} />
          </span>
          <span>
            TRACEL<span className="brand-version mono">/ 01</span>
          </span>
        </a>
        <div className="site-identity">
          <span className="site-icon">
            <Globe2 size={14} />
          </span>
          <span>elytra.dev</span>
          <span className="site-label">OBSERVED SITE</span>
        </div>
        <div className="header-right">
          <span className="demo-badge">SIMULATED DATA</span>
          <span className="header-live">
            <span className={`status-dot ${paused ? "paused" : ""}`} />
            {paused ? "PAUSED" : "LIVE"}
          </span>
          <Clock />
          <Button
            variant="ghost"
            size="icon"
            aria-label={fullScreen ? "Exit fullscreen" : "Enter fullscreen"}
            title="Fullscreen"
            onClick={toggleFullscreen}
          >
            {fullScreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </Button>
        </div>
      </header>
      <div className="workspace">
        <main className="globe-view" aria-label="Live visitor globe">
          <div className="view-heading">
            <div>
              <div className="eyebrow">
                <span className="tiny-line" />
                GLOBAL OBSERVATION
              </div>
              <h1>
                Live overview<span className="heading-dot">.</span>
              </h1>
              <p>Visitors on elytra.dev, right now.</p>
            </div>
            <span className="view-index mono">01 / LIVE</span>
          </div>
          <div className="globe-stage">
            <div className="globe-reticle" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <Globe
              reducedMotion={reducedMotion}
              resetKey={resetKey}
              zoom={zoom}
            />
          </div>
          <div className="globe-coordinate mono">
            <span>GEO / WGS 84</span>
            <span>LAT 90° N — 90° S</span>
          </div>
          <div className="globe-legend">
            <span>
              <i className="online" />
              Online
            </span>
            <span>
              <i className="idle" />
              Idle
            </span>
            <span>
              <i className="offline" />
              Leaving
            </span>
          </div>
          <div className="globe-instructions">
            <span className="drag-icon">↔</span>Drag to orbit<span>·</span>
            Scroll to zoom<span>·</span>Select a visitor
          </div>
          <div className="globe-controls">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() =>
                setZoom((value) => (value === -0.65 ? -0.6501 : -0.65))
              }
            >
              <Plus size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() =>
                setZoom((value) => (value === 0.65 ? 0.6501 : 0.65))
              }
            >
              <Minus size={16} />
            </Button>
            <span />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reset globe view"
              title="Reset globe view"
              onClick={() => {
                useRadarStore.getState().select(null);
                setResetKey((value) => value + 1);
              }}
            >
              <Crosshair size={16} />
            </Button>
          </div>
          {notice && (
            <button className="preview-notice" onClick={() => setNotice("")}>
              {notice} ×
            </button>
          )}
        </main>
        <VisitorPanel />
        <EventFeed />
      </div>
      <Metrics />
      <footer className="app-footer">
        <div className="footer-caption">
          <span className="footer-cross">+</span>
          <span>TRACEL LIVE</span>
          <span className="footer-divider">/</span>
          <span>LOCAL SIMULATION</span>
        </div>
        <div className="simulation-controls">
          <Button
            variant="ghost"
            aria-label={paused ? "Resume simulation" : "Pause simulation"}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            <span>{paused ? "Resume" : "Pause"}</span>
          </Button>
          <span className="control-separator" />
          <div className="speed-controls" aria-label="Simulation speed">
            {[1, 5, 20].map((value) => (
              <button
                key={value}
                className={speed === value ? "active" : ""}
                aria-pressed={speed === value}
                aria-label={`Simulation speed ${value}×`}
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
          <span className="control-separator" />
          <div className="simulation-menu">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Simulation tools"
              aria-expanded={controlsOpen}
              onClick={() => setControlsOpen(!controlsOpen)}
            >
              <SlidersHorizontal size={14} />
            </Button>
            {controlsOpen && (
              <div className="simulation-popover">
                <span className="eyebrow">SIMULATION TOOLS</span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    spawn();
                    setControlsOpen(false);
                  }}
                >
                  <Plus size={14} />
                  Spawn visitor
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    reset();
                    setControlsOpen(false);
                    setResetKey((value) => value + 1);
                  }}
                >
                  <RotateCcw size={14} />
                  Reset simulation
                </Button>
                <p>
                  Speed changes simulated time.
                  <br />
                  UTC remains real time.
                </p>
              </div>
            )}
          </div>
        </div>
      </footer>
      <span className="sr-only" role="status" aria-live="polite">
        {paused ? "Simulation paused" : "Simulation running"}.{" "}
        {selected
          ? `Selected visitor ${selected.id.slice(0, 6)} in ${selected.location.city}.`
          : "No visitor selected."}
      </span>
    </div>
  );
}
