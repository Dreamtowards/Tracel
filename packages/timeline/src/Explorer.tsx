"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  AudioLines,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code2,
  Command,
  Download,
  Figma,
  Focus,
  Globe,
  Hand,
  HelpCircle,
  Maximize2,
  Minus,
  Monitor,
  MousePointer2,
  Music2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Radio,
  SlidersHorizontal,
  Terminal,
  X,
} from "lucide-react";
import { analyze } from "./analytics";
import {
  Capture,
  DataProvider,
  Range,
  DAY,
  clampRange,
  zoomRange,
  clock,
  dateLabel,
  duration,
  bytes,
  metricInfo,
} from "./model";
import { Timeline } from "./Timeline";
import { overviewPath } from "./overview";
import { DisplaySettings, defaultAppearance } from "./DisplaySettings";
import "./explorer.css";

function AppIcon({ id, size = 15 }: { id: string; size?: number }) {
  const Icon =
    {
      code: Code2,
      chrome: Globe,
      unity: Box,
      spotify: Music2,
      figma: Figma,
      terminal: Terminal,
    }[id] ?? Monitor;
  return <Icon size={size} />;
}

export type RangeExport = {
  source: string;
  epoch: string;
  range: Range;
  analytics: ReturnType<typeof analyze>;
};

export default function Explorer({
  provider,
  homeHref = "/timeline",
  machineLabel,
  headerActions,
  localDataLabel = "All data stays in this browser",
  onExport,
  pageContent,
  railExtra,
  onShowTimeline,
  captureLabel = "Demo capture",
}: {
  provider: DataProvider;
  homeHref?: string;
  machineLabel?: ReactNode;
  headerActions?: ReactNode;
  localDataLabel?: string;
  onExport?: (payload: RangeExport) => Promise<void>;
  pageContent?: ReactNode;
  railExtra?: ReactNode;
  onShowTimeline?: () => void;
  captureLabel?: string;
}) {
  const [data, setData] = useState<Capture | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [view, setView] = useState<Range>({
    start: 6 * DAY + 6 * 3600,
    end: 7 * DAY,
  });
  const [selection, setSelection] = useState<Range | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "pan">("select");
  const [tab, setTab] = useState<"Activity" | "Performance" | "Media">(
    "Activity",
  );
  const [inspector, setInspector] = useState(true);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [appearance, setAppearance] = useState(defaultAppearance);
  const [day, setDay] = useState(6);
  const [preset, setPreset] = useState("Day");
  useEffect(() => {
    let active = true;
    setLoadError(false);
    Promise.resolve().then(() => provider.load()).then((result) => {
      if (active) setData(result);
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => {
      active = false;
    };
  }, [provider, loadAttempt]);
  useEffect(() => {
    if (!help) return;
    const previous = document.activeElement as HTMLElement | null;
    const close = document.querySelector<HTMLButtonElement>(".tx-help button");
    close?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelp(false);
      if (event.key === "Tab") {
        event.preventDefault();
        close?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [help]);
  const range = selection ?? view;
  const overview = useMemo(() => (data ? overviewPath(data) : ""), [data]);
  const stats = useMemo(
    () => (data ? analyze(data, range) : null),
    [data, range],
  );
  if (!data || !stats)
    return (
      <main className="tx-app tx-loading">
        <Activity size={28} />
        <p role={loadError ? "alert" : "status"}>
          {loadError ? "Could not load this capture. Please try again." : "Preparing your activity timeline…"}
        </p>
        {loadError && <button className="tx-button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Try again</button>}
      </main>
    );
  const selectedApp = stats.apps.find((a) => a.id === focus);
  const coverage = stats.metrics.cpu.coverage;
  const navigate = (nextDay: number, nextPreset = preset) => {
    const d = Math.max(0, Math.min(6, nextDay));
    setDay(d);
    setPreset(nextPreset);
    setView(
      nextPreset === "Week"
        ? data.bounds
        : nextPreset === "1 hour"
          ? { start: d * DAY + 10.5 * 3600, end: d * DAY + 11.5 * 3600 }
          : { start: d * DAY + 6 * 3600, end: (d + 1) * DAY },
    );
  };
  const changeView = (next: Range) => {
    setView(next);
    setPreset("Custom");
    setDay(Math.min(6, Math.floor((next.start + next.end) / 2 / DAY)));
  };
  const zoom = (factor: number) =>
    changeView(
      zoomRange(view, factor, (view.start + view.end) / 2, data.bounds),
    );
  const exportSelection = async () => {
    if (exporting) return;
    const payload: RangeExport = {
      source: "Tracel simulated capture",
      epoch: data.epoch,
      range,
      analytics: stats,
    };
    setExportError(false);
    if (onExport) {
      setExporting(true);
      try {
        await onExport(payload);
      } catch {
        setExportError(true);
      } finally {
        setExporting(false);
      }
      return;
    }
    const blob = new Blob(
      [
        JSON.stringify(
          payload,
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tracel-selection.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main className="tx-app">
      <header className="tx-header">
        <a href={homeHref} className="tx-brand">
          <span className="tx-brand-mark">
            <Activity size={23} />
          </span>
          tracel
          <span className="tx-brand-divider" />
        </a>
        <span className="tx-workspace">
          <Monitor size={14} /> Personal workspace <ChevronRight size={12} />{" "}
          <strong>Explorer</strong>
        </span>
        <div className="tx-header-end">
          <span className="tx-demo">
            <i /> {captureLabel}
          </span>
          <span className="tx-machine">
            {machineLabel ?? <>DESKTOP–ALEX <span>/</span> Windows 11</>}
          </span>
          {headerActions}
          <button
            className="tx-icon-button"
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={17} />
          </button>
          <span className="tx-avatar">A</span>
        </div>
      </header>
      <div className="tx-shell">
        <nav className="tx-rail" aria-label="Explorer navigation">
          <button
            className={pageContent ? undefined : "tx-rail-active"}
            title="Timeline explorer"
            aria-label="Timeline explorer"
            onClick={() => {
              onShowTimeline?.();
              setFocus(null);
              setSelection(null);
              navigate(6, "Day");
            }}
          >
            <Activity size={20} />
          </button>
          <button
            title="Application analytics"
            aria-label="Application analytics"
            onClick={() => {
              onShowTimeline?.();
              setInspector(true);
              setTab("Activity");
            }}
          >
            <Command size={19} />
          </button>
          <button
            title="Performance analytics"
            aria-label="Performance analytics"
            onClick={() => {
              onShowTimeline?.();
              setInspector(true);
              setTab("Performance");
            }}
          >
            <SlidersHorizontal size={19} />
          </button>
          <button
            title="Media sessions"
            aria-label="Media sessions"
            onClick={() => {
              onShowTimeline?.();
              setInspector(true);
              setTab("Media");
            }}
          >
            <AudioLines size={20} />
          </button>
          {railExtra}
          <div className="tx-rail-bottom">
            <span>LOCAL</span>
            <Monitor size={18} />
            <i />
          </div>
        </nav>
        <section className="tx-main">
          {pageContent ?? <>
          <div className="tx-page-heading">
            <div>
              <div className="tx-eyebrow">YOUR COMPUTER, IN CONTEXT</div>
              <h1>
                Activity explorer<span className="tx-version">BETA</span>
              </h1>
              <p>
                A complete picture of your time. Every app, every resource, one
                timeline.
              </p>
            </div>
            <div className="tx-export-actions">
              <button className="tx-button" onClick={exportSelection} disabled={exporting}>
                <Download size={14} /> {exporting ? "Saving…" : "Export range"}
              </button>
              {exportError && <span role="alert">Could not save the export. Please try again.</span>}
            </div>
          </div>
          <div className="tx-toolbar">
            <div className="tx-date-controls">
              <button
                className="tx-icon-button"
                aria-label="Previous day"
                disabled={day === 0}
                onClick={() => navigate(day - 1, "Day")}
              >
                <ChevronLeft size={15} />
              </button>
              <label className="tx-date">
                <CalendarDays size={14} />
                <input
                  aria-label="Capture date"
                  type="date"
                  min="2026-10-08"
                  max="2026-10-14"
                  value={`2026-10-${String(day + 8).padStart(2, "0")}`}
                  onChange={(e) => {
                    if (e.target.value)
                      navigate(Number(e.target.value.slice(-2)) - 8, "Day");
                  }}
                />
              </label>
              <button
                className="tx-icon-button"
                aria-label="Next day"
                disabled={day === 6}
                onClick={() => navigate(day + 1, "Day")}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <button
              className="tx-text-button"
              onClick={() => navigate(6, "Day")}
            >
              Today
            </button>
            <div className="tx-separator" />
            <div className="tx-segmented">
              {["1 hour", "Day", "Week"].map((p) => (
                <button
                  className={preset === p ? "active" : ""}
                  key={p}
                  onClick={() => navigate(day, p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="tx-toolbar-space" />
            <div className="tx-settings-anchor">
              <button
                className={`tx-button ${settings ? "tx-settings-active" : ""}`}
                aria-label="Display settings"
                aria-expanded={settings}
                onClick={() => setSettings(!settings)}
              >
                <SlidersHorizontal size={14} /> Display
              </button>
              {settings && (
                <DisplaySettings
                  value={appearance}
                  onChange={setAppearance}
                  onClose={() => setSettings(false)}
                />
              )}
            </div>
            <div className="tx-segmented tx-tools">
              <button
                title="Select range"
                aria-label="Select range"
                className={mode === "select" ? "active" : ""}
                onClick={() => setMode("select")}
              >
                <MousePointer2 size={14} />
              </button>
              <button
                title="Pan timeline"
                aria-label="Pan timeline"
                className={mode === "pan" ? "active" : ""}
                onClick={() => setMode("pan")}
              >
                <Hand size={14} />
              </button>
            </div>
            <div className="tx-separator" />
            <button
              className="tx-icon-button"
              aria-label="Zoom out"
              onClick={() => zoom(1.5)}
            >
              <Minus size={15} />
            </button>
            <span className="tx-zoom-label">
              {duration(view.end - view.start)}
            </span>
            <button
              className="tx-icon-button"
              aria-label="Zoom in"
              onClick={() => zoom(1 / 1.5)}
            >
              <Plus size={15} />
            </button>
            <button
              className="tx-icon-button"
              aria-label="Fit all data"
              title="Fit all data"
              onClick={() => navigate(day, "Week")}
            >
              <Maximize2 size={14} />
            </button>
            <button
              className="tx-icon-button"
              aria-label="Toggle inspector"
              title="Toggle inspector"
              onClick={() => setInspector(!inspector)}
            >
              {inspector ? (
                <PanelRightClose size={17} />
              ) : (
                <PanelRightOpen size={17} />
              )}
            </button>
          </div>
          <div className="tx-overview">
            <div className="tx-overview-heading">
              <span>
                <Radio size={12} /> CAPTURE OVERVIEW
              </span>
              <span>
                OCT 08 – OCT 14, 2026 <b>7 days</b>
              </span>
            </div>
            <div
              className="tx-overview-plot"
              role="slider"
              tabIndex={0}
              aria-label="Overview viewport position"
              aria-valuemin={0}
              aria-valuemax={data.bounds.end}
              aria-valuenow={view.start}
              aria-valuetext={`${dateLabel(view.start)} ${clock(view.start)} to ${dateLabel(view.end)} ${clock(view.end)}`}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const delta = (e.key === "ArrowRight" ? 1 : -1) * 3600;
                  changeView(
                    clampRange(
                      { start: view.start + delta, end: view.end + delta },
                      data.bounds,
                    ),
                  );
                }
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                const time =
                  ((e.clientX - rect.left) / rect.width) * data.bounds.end;
                const span = view.end - view.start;
                changeView(
                  clampRange(
                    { start: time - span / 2, end: time + span / 2 },
                    data.bounds,
                  ),
                );
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const time =
                  ((e.clientX - rect.left) / rect.width) * data.bounds.end;
                const span = view.end - view.start;
                changeView(
                  clampRange(
                    { start: time - span / 2, end: time + span / 2 },
                    data.bounds,
                  ),
                );
              }}
            >
              <svg
                viewBox="0 0 1400 44"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {data.activity.map((a) => (
                  <rect
                    key={a.id}
                    x={(a.start / data.bounds.end) * 1400}
                    y={33}
                    width={((a.end - a.start) / data.bounds.end) * 1400}
                    height={6}
                    fill={data.apps.find((app) => app.id === a.appId)!.color}
                    opacity=".55"
                  />
                ))}
                <path
                  d={overview}
                  fill="none"
                  stroke={metricInfo.cpu.color}
                  strokeWidth="1.2"
                />
              </svg>
              <div
                className="tx-overview-window"
                style={{
                  left: `${(view.start / data.bounds.end) * 100}%`,
                  width: `${((view.end - view.start) / data.bounds.end) * 100}%`,
                }}
              >
                <i />
                <i />
              </div>
            </div>
            <div className="tx-overview-days">
              {Array.from({ length: 7 }, (_, d) => (
                <button
                  key={d}
                  className={d === day ? "active" : ""}
                  onClick={() => navigate(d, "Day")}
                >
                  {["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"][d]}{" "}
                  <span>{8 + d}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="tx-content">
            <section className="tx-timeline-panel">
              <div className="tx-timeline-heading">
                <span>
                  <span className="tx-live-dot" /> Timeline{" "}
                  <small>
                    {dateLabel(view.start)} · {clock(view.start)} —{" "}
                    {view.end - view.start > DAY
                      ? dateLabel(view.end - 1)
                      : clock(view.end)}
                  </small>
                </span>
                <span className="tx-timeline-hint">
                  {view.end - view.start > DAY * 2
                    ? "Aggregated activity"
                    : view.end - view.start < 7200
                      ? "Context detail"
                      : "Application intervals"}{" "}
                  <span>·</span> 30s samples
                </span>
              </div>
              <Timeline
                data={data}
                view={view}
                selection={selection}
                mode={mode}
                focus={focus}
                appearance={appearance}
                onView={changeView}
                onSelect={setSelection}
                onFocus={setFocus}
              />
              <div className="tx-timeline-bottom">
                <span>
                  <MousePointer2 size={12} /> Drag to select <kbd>Alt</kbd> drag
                  to pan <span>·</span> Scroll to zoom
                </span>
                <button
                  className="tx-text-button"
                  onClick={() => setHelp(true)}
                >
                  Shortcuts <HelpCircle size={12} />
                </button>
              </div>
            </section>
            {inspector && (
              <aside className="tx-inspector">
                <div className="tx-inspector-title">
                  <span>
                    <Focus size={15} />{" "}
                    {selection ? "Selection inspector" : "Range overview"}
                  </span>
                  {selection ? (
                    <button
                      aria-label="Clear selection"
                      className="tx-icon-button"
                      onClick={() => setSelection(null)}
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <span className="tx-small-badge">VISIBLE RANGE</span>
                  )}
                </div>
                <div className="tx-range">
                  <strong>
                    {duration(range.end - range.start)}{" "}
                    <small>
                      {selection ? "Selected duration" : "Visible duration"}
                    </small>
                  </strong>
                  <div>
                    {dateLabel(range.start)}
                    {Math.floor(range.start / DAY) !==
                    Math.floor(range.end / DAY)
                      ? ` – ${dateLabel(range.end)}`
                      : ""}{" "}
                    <span>
                      {clock(range.start, true)} — {clock(range.end, true)}
                    </span>
                  </div>
                  {selection && (
                    <button
                      className="tx-button"
                      onClick={() =>
                        changeView(clampRange(selection, data.bounds))
                      }
                    >
                      <Maximize2 size={12} /> Zoom to selection
                    </button>
                  )}
                </div>
                <div className="tx-tabs">
                  {(["Activity", "Performance", "Media"] as const).map((t) => (
                    <button
                      className={tab === t ? "active" : ""}
                      key={t}
                      onClick={() => setTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="tx-inspector-body">
                  {tab === "Activity" && (
                    <>
                      <div className="tx-active-summary">
                        <div>
                          <label>
                            <i /> Active time
                          </label>
                          <strong>{duration(stats.active)}</strong>
                        </div>
                        <div>
                          <label>
                            <i className="tx-idle-dot" /> Idle / AFK
                          </label>
                          <strong>{duration(stats.afk)}</strong>
                        </div>
                      </div>
                      <div className="tx-proportion">
                        {stats.apps
                          .filter((a) => a.active > 0)
                          .map((a) => (
                            <button
                              title={`${a.name}: ${duration(a.active)}`}
                              aria-label={`Focus ${a.name}`}
                              key={a.id}
                              style={{
                                width: `${(a.active / Math.max(1, stats.active)) * 100}%`,
                                background: a.color,
                              }}
                              onClick={() =>
                                setFocus(focus === a.id ? null : a.id)
                              }
                            />
                          ))}
                      </div>
                      <div className="tx-section-heading">
                        APPLICATIONS <span>ACTIVE TIME</span>
                      </div>
                      <div className="tx-app-list">
                        {stats.apps
                          .filter((a) => a.foreground > 0)
                          .map((a) => (
                            <button
                              className={focus === a.id ? "selected" : ""}
                              key={a.id}
                              onClick={() =>
                                setFocus(focus === a.id ? null : a.id)
                              }
                            >
                              <span
                                className="tx-app-icon"
                                style={{
                                  color: a.color,
                                  background: a.color + "15",
                                }}
                              >
                                <AppIcon id={a.id} />
                              </span>
                              <span className="tx-app-name">
                                {a.name}
                                <span className="tx-app-bar">
                                  <i
                                    style={{
                                      width: `${(a.active / Math.max(1, stats.apps[0].active)) * 100}%`,
                                      background: a.color,
                                    }}
                                  />
                                </span>
                              </span>
                              <span className="tx-app-duration">
                                {duration(a.active)}
                                <small>
                                  {Math.round(
                                    (a.active / Math.max(1, stats.active)) *
                                      100,
                                  )}
                                  %
                                </small>
                              </span>
                            </button>
                          ))}
                      </div>
                      <div className="tx-stat-line">
                        <span>App switches</span>
                        <strong>{stats.switches}</strong>
                      </div>
                      <div className="tx-stat-line">
                        <span>Foreground duration</span>
                        <strong>{duration(stats.foreground)}</strong>
                      </div>
                      {!stats.foreground && (
                        <p className="tx-empty">
                          No foreground activity in this range. Navigate to a
                          recorded work session.
                        </p>
                      )}
                      <div className="tx-section-heading">
                        {selectedApp
                          ? `${selectedApp.name.toUpperCase()} CONTEXT`
                          : "ASSOCIATED CONTEXT"}
                        {focus && (
                          <button
                            className="tx-text-button"
                            onClick={() => setFocus(null)}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="tx-context-list">
                        {(selectedApp
                          ? selectedApp.contexts
                          : stats.apps.flatMap((a) => a.contexts)
                        )
                          .slice(0, 8)
                          .map((c, i) => (
                            <div key={`${c.start}-${i}`}>
                              <span>
                                {c.kind === "url" ? (
                                  <Globe size={12} />
                                ) : (
                                  <Code2 size={12} />
                                )}
                                {c.title}
                              </span>
                              <small title={c.value}>{c.value}</small>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                  {tab === "Performance" && (
                    <>
                      <div className="tx-section-heading">
                        SYSTEM RESOURCES <span>AVG / PEAK</span>
                      </div>
                      {(["cpu", "ram", "gpu"] as const).map((key) => (
                        <div className="tx-performance-stat" key={key}>
                          <label>
                            <i style={{ background: metricInfo[key].color }} />
                            {metricInfo[key].name}
                          </label>
                          <div>
                            <strong>
                              {stats.metrics[key].average?.toFixed(1) ?? "—"}
                              <small> {metricInfo[key].unit}</small>
                            </strong>
                            <span>
                              {stats.metrics[key].peak?.toFixed(1) ?? "—"}{" "}
                              {metricInfo[key].unit}
                            </span>
                          </div>
                          <div className="tx-meter">
                            <i
                              style={{
                                width: `${((stats.metrics[key].average ?? 0) / metricInfo[key].max) * 100}%`,
                                background: metricInfo[key].color,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="tx-section-heading">
                        TRANSFER TOTALS <span>IN RANGE</span>
                      </div>
                      {(["download", "upload", "read", "write"] as const).map(
                        (key) => (
                          <div className="tx-transfer" key={key}>
                            <span>
                              {key === "download" || key === "read" ? (
                                <ArrowDown size={13} />
                              ) : (
                                <ArrowUp size={13} />
                              )}
                              {metricInfo[key].name}
                            </span>
                            <strong>
                              {coverage ? bytes(stats.metrics[key].total) : "—"}
                            </strong>
                            <small>
                              Avg{" "}
                              {stats.metrics[key].average?.toFixed(2) ?? "—"} ·
                              Peak {stats.metrics[key].peak?.toFixed(2) ?? "—"}{" "}
                              MB/s
                            </small>
                          </div>
                        ),
                      )}
                      <p className="tx-note">
                        Time-weighted statistics from system samples. Gaps and
                        sleep are excluded; zero values are included.
                      </p>
                    </>
                  )}
                  {tab === "Media" && (
                    <>
                      <div className="tx-section-heading">
                        MEDIA SESSIONS <span>{stats.media.length}</span>
                      </div>
                      {stats.media.map((m, i) => (
                        <div className="tx-media-item" key={`${m.start}-${i}`}>
                          <span className="tx-media-icon">
                            <Music2 size={20} />
                          </span>
                          <div>
                            <strong>{m.title}</strong>
                            <small>{m.artist}</small>
                            <span>
                              {data.apps.find((a) => a.id === m.appId)!.name} ·{" "}
                              {duration(m.duration)}
                            </span>
                          </div>
                          <button
                            className="tx-icon-button"
                            title="Show media interval"
                            aria-label={`Show ${m.title} interval`}
                            onClick={() => {
                              setSelection({ start: m.start, end: m.end });
                              changeView(
                                clampRange(
                                  { start: m.start - 300, end: m.end + 300 },
                                  data.bounds,
                                ),
                              );
                            }}
                          >
                            <Focus size={14} />
                          </button>
                        </div>
                      ))}
                      {!stats.media.length && (
                        <p className="tx-empty">
                          No media sessions in this range.
                        </p>
                      )}
                      <p className="tx-note">
                        Media session metadata and system audio levels are
                        recorded independently. Playback duration is clipped to
                        this range.
                      </p>
                    </>
                  )}
                </div>
                <div className="tx-inspector-foot">
                  <span className="tx-live-dot" />{" "}
                  {(
                    (coverage / Math.max(0.001, range.end - range.start)) *
                    100
                  ).toFixed(1)}
                  % metric coverage <span>System subject</span>
                </div>
              </aside>
            )}
          </div>
          <section className="tx-summary-strip">
            <div>
              <span
                className="tx-summary-icon"
                style={{
                  color: metricInfo.cpu.color,
                  background: metricInfo.cpu.color + "18",
                }}
              >
                <Activity size={17} />
              </span>
              <label>
                CPU AVERAGE
                <strong>
                  {stats.metrics.cpu.average?.toFixed(1) ?? "—"}
                  <small>%</small>
                </strong>
              </label>
              <span className="tx-summary-detail">
                Peak {stats.metrics.cpu.peak?.toFixed(0) ?? "—"}%
              </span>
            </div>
            <div>
              <span
                className="tx-summary-icon"
                style={{
                  color: metricInfo.ram.color,
                  background: metricInfo.ram.color + "18",
                }}
              >
                <Monitor size={17} />
              </span>
              <label>
                MEMORY AVERAGE
                <strong>
                  {stats.metrics.ram.average?.toFixed(1) ?? "—"}
                  <small>GB</small>
                </strong>
              </label>
              <span className="tx-summary-detail">of 32 GB</span>
            </div>
            <div>
              <span
                className="tx-summary-icon"
                style={{
                  color: metricInfo.download.color,
                  background: metricInfo.download.color + "18",
                }}
              >
                <ArrowDown size={18} />
              </span>
              <label>
                DOWNLOADED
                <strong>
                  {coverage ? bytes(stats.metrics.download.total) : "—"}
                </strong>
              </label>
            </div>
            <div>
              <span
                className="tx-summary-icon"
                style={{
                  color: metricInfo.write.color,
                  background: metricInfo.write.color + "18",
                }}
              >
                <Box size={17} />
              </span>
              <label>
                DISK WRITTEN
                <strong>
                  {coverage ? bytes(stats.metrics.write.total) : "—"}
                </strong>
              </label>
            </div>
          </section>
          <footer className="tx-status">
            <span>
              <span className="tx-live-dot" /> {localDataLabel}{" "}
              <span>·</span> Deterministic demo
            </span>
            <span>
              {data.metrics.length.toLocaleString("en-US")} samples{" "}
              <span>·</span> {data.activity.length} intervals <span>·</span>{" "}
              {selection ? "Selection statistics" : "Visible range statistics"}
            </span>
          </footer>
          </>}
        </section>
      </div>
      {help && (
        <div className="tx-modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="tx-help"
            role="dialog"
            aria-modal="true"
            aria-label="Timeline shortcuts"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setHelp(false);
            }}
          >
            <button
              className="tx-icon-button"
              aria-label="Close shortcuts"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <h2>Explore at your own pace.</h2>
            <p>One time coordinate, across every track.</p>
            {[
              ["Scroll", "Zoom around the pointer"],
              ["Shift + scroll", "Pan horizontally"],
              ["Drag", "Select a time range"],
              ["Alt + drag", "Pan without changing tools"],
              ["Click app", "Focus its activity and context"],
              ["+ / −", "Zoom the focused timeline"],
              ["← / →", "Pan the focused timeline"],
              ["Esc", "Clear selection on the timeline"],
            ].map(([key, action]) => (
              <div key={key}>
                <span>{action}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
            <p>
              Expand foreground activity to see files and URLs. Drag a track
              label’s lower edge to resize it. Blank metric regions indicate
              sleep or missing samples. Demo dates: October 8–14, 2026.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
