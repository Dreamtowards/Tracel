"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  Map as MapIcon,
  ALargeSmall,
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
import { TrafficChart } from "./telemetry/TrafficChart";
import { AudienceRankings } from "./telemetry/AudienceRankings";
import { useRadarStore } from "@/radar/store";
import { useSimulation } from "@/radar/use-simulation";
import { themePalettes, type ThemeColor } from "@/radar/theme";
import { time } from "@/radar/format";

const Globe = dynamic(() => import("./globe/Globe"), {
  ssr: false,
  loading: () => (
    <div className="globe-loading">
      <ScanLine size={28} />
      <span>Loading globe…</span>
    </div>
  ),
});
const FlatMap = dynamic(() => import("./map/FlatMap"), {
  ssr: false,
  loading: () => (
    <div className="globe-loading">
      <MapIcon size={25} />
      <span>Loading map…</span>
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

export function RadarView() {
  const { reset, spawn } = useSimulation();
  const themeColor = useRadarStore((state) => state.themeColor);
  const setThemeColor = useRadarStore((state) => state.setThemeColor);
  const palette = themePalettes[themeColor];
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
  const [insightsHeight, setInsightsHeight] = useState<number | null>(null);
  const resizeStart = useRef<{ y: number; height: number } | null>(null);
  const [showPlaceNames, setShowPlaceNames] = useState(false);
  const [view, setView] = useState<"map" | "globe">("map");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tracel-theme");
      if (saved && Object.hasOwn(themePalettes, saved))
        setThemeColor(saved as ThemeColor);
    } catch {}
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
    <div
      data-theme={themeColor}
      style={
        {
          "--tracel-live": palette.live,
          "--tracel-live-dim": palette.dim,
          "--tracel-accent": palette.selected,
          "--tracel-accent-dim": palette.dim,
          "--tracel-info": palette.info,
          "--theme-heat": palette.heat,
          "--theme-bright": palette.bright,
        } as React.CSSProperties
      }
      className={`radar-app radar-expanded ${selected ? "visitor-selected" : ""} ${view === "map" ? "map-mode" : "globe-mode"}`}
    >
      <header className="app-header">
        <a className="brand" href="/" aria-label="Tracel home">
          <span className="brand-symbol">
            <Crosshair size={25} strokeWidth={1.3} />
          </span>
          <span>TRACEL</span>
        </a>
        <div className="site-identity">
          <span className="site-icon">
            <Globe2 size={14} />
          </span>
          <span>elytra.dev</span>
        </div>
        <div className="header-right">
          <span className="demo-badge">Simulated</span>
          <span className="header-live">
            <span className={`status-dot ${paused ? "paused" : ""}`} />
            {paused ? "Paused" : "Live"}
          </span>
          <Clock />
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
                aria-label="Display and simulation settings"
                title="Display and simulation settings"
                aria-expanded={controlsOpen}
                onClick={() => setControlsOpen(!controlsOpen)}
              >
                <SlidersHorizontal size={14} />
              </Button>
              {controlsOpen && (
                <div className="simulation-popover">
                  <span className="eyebrow">Theme color</span>
                  <div
                    className="theme-options"
                    role="group"
                    aria-label="Theme color"
                  >
                    {(Object.keys(themePalettes) as ThemeColor[]).map(
                      (color) => (
                        <button
                          key={color}
                          aria-pressed={themeColor === color}
                          onClick={() => {
                            setThemeColor(color);
                            try {
                              localStorage.setItem("tracel-theme", color);
                            } catch {}
                          }}
                        >
                          <i
                            style={{ background: themePalettes[color].live }}
                          />
                          {themePalettes[color].label}
                        </button>
                      ),
                    )}
                  </div>
                  <span className="eyebrow simulation-tools-label">
                    Simulation
                  </span>
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
        <main
          className="globe-view"
          aria-label={
            view === "map" ? "Live visitor map" : "Live visitor globe"
          }
        >
          <div className="map-toolbar">
            <div
              className="view-switch"
              role="group"
              aria-label="Geographic view"
            >
              <button
                aria-pressed={view === "map"}
                onClick={() => setView("map")}
              >
                <MapIcon size={14} />
                Map
              </button>
              <button
                aria-pressed={view === "globe"}
                onClick={() => setView("globe")}
              >
                <Globe2 size={14} />
                Globe
              </button>
            </div>
            {view === "map" && (
              <button
                className="place-names-toggle"
                aria-pressed={showPlaceNames}
                onClick={() => setShowPlaceNames(!showPlaceNames)}
                aria-label={
                  showPlaceNames
                    ? "Hide map place names"
                    : "Show map place names"
                }
                title={
                  showPlaceNames
                    ? "Hide map place names"
                    : "Show map place names"
                }
              >
                <ALargeSmall size={18} />
              </button>
            )}
          </div>
          <div className="globe-stage">
            {view === "globe" ? (
              <Globe
                reducedMotion={reducedMotion}
                resetKey={resetKey}
                zoom={zoom}
              />
            ) : (
              <FlatMap
                showPlaceNames={showPlaceNames}
                reducedMotion={reducedMotion}
                resetKey={resetKey}
                zoom={zoom}
              />
            )}
          </div>
          <div className="map-bottom-bar">
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
              <span className="drag-icon">↔</span>
              {view === "map" ? "Drag to pan" : "Drag to orbit"}
              <span>·</span>
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
                aria-label="Reset geographic view"
                title="Reset view"
                onClick={() => {
                  useRadarStore.getState().select(null);
                  setResetKey((value) => value + 1);
                }}
              >
                <Crosshair size={16} />
              </Button>
            </div>
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
      <div
        className="insights"
        style={
          insightsHeight === null
            ? undefined
            : { height: insightsHeight, minHeight: insightsHeight }
        }
      >
        <div
          className="insights-resize"
          role="separator"
          aria-label="Resize analytics panel"
          aria-orientation="horizontal"
          aria-valuemin={240}
          aria-valuemax={560}
          aria-valuenow={insightsHeight ?? 320}
          tabIndex={0}
          title="Drag to resize analytics"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            resizeStart.current = {
              y: event.clientY,
              height:
                event.currentTarget.parentElement!.getBoundingClientRect()
                  .height,
            };
          }}
          onPointerMove={(event) => {
            if (resizeStart.current)
              setInsightsHeight(
                Math.max(
                  240,
                  Math.min(
                    Math.max(240, Math.min(560, window.innerHeight - 400)),
                    resizeStart.current.height +
                      resizeStart.current.y -
                      event.clientY,
                  ),
                ),
              );
          }}
          onPointerUp={() => {
            resizeStart.current = null;
          }}
          onPointerCancel={() => {
            resizeStart.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              setInsightsHeight(
                Math.max(
                  240,
                  Math.min(
                    560,
                    (insightsHeight ??
                      event.currentTarget.parentElement!.getBoundingClientRect()
                        .height) + (event.key === "ArrowUp" ? 20 : -20),
                  ),
                ),
              );
            }
          }}
        />
        <TrafficChart />
        <AudienceRankings />
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {paused ? "Simulation paused" : "Simulation running"}.{" "}
        {selected
          ? `Selected visitor ${selected.id.slice(0, 6)} in ${selected.location.city}.`
          : "No visitor selected."}
      </span>
    </div>
  );
}
