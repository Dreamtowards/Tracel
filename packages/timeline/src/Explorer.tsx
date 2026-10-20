"use client";
import { useI18n, useCaptureTime } from "./i18n";

import { useEffect, useMemo, useState, type ReactNode, type ReactElement } from "react";
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Download,
  ArrowDown,
  ArrowUp,
  AudioLines,
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code2,
  Command,
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
import { applicationGroups, categoryApplications, categoryResolver, categoryTotals, type CategoryConfig } from "./categories";
import { analyze } from "./analytics";
import {
  Capture,
  Application,
  DataProvider,
  Range,
  DAY,
  clampRange,
  followRange,
  zoomRange,
  clock,
  dateLabel,
  duration,
  bytes,
  metricInfo as defaultMetricInfo,
  getMetricInfo,
  sampleEnd,
  overlap,
} from "./model";
import { Timeline, type TimelinePalette } from "./Timeline";
import { OverviewViewport } from "./OverviewViewport";
import { overviewPath } from "./overview";
import { RecordedOverview } from "./RecordedOverview";
import type { TrackSource } from "./trackVisibility";
import type { HistoryControls } from "./history";
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
  classification?: { config: CategoryConfig; totals: ReturnType<typeof categoryTotals> };
  metrics?: Capture["metrics"];
  media?: Capture["media"];
  apps?: Capture["apps"];
  activity?: Capture["activity"];
  background?: Capture["background"];
  afk?: Capture["afk"];
  metricUnits?: Record<string, { value: string; integral: string }>;
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
  headerVariant = "full",
  navigation,
  compact = false,
  renderDatePicker,
  palette,
  capture,
  calendar,
  dataError,
  categories,
  renderAppIcon,
  renderTrackHeaders,
  hiddenSources,
  history,
}: {
  history?: HistoryControls;
  hiddenSources?: readonly TrackSource[];
  provider: DataProvider;
  categories?: CategoryConfig;
  /** Host-owned context menu for the label column, without native/shared dependencies. */
  renderTrackHeaders?: (headers: ReactElement) => ReactNode;
  /** Optional native-host icon renderer; the shared Timeline never reads executable files. */
  renderAppIcon?: (app: Application, fallback: ReactNode) => ReactNode;
  capture?: Capture;
  calendar?: { value: string; min: string; max: string; onChange: (value: string) => void };
  dataError?: string;
  homeHref?: string;
  machineLabel?: ReactNode;
  headerActions?: ReactNode;
  localDataLabel?: string;
  onExport?: (payload: RangeExport) => Promise<void>;
  pageContent?: ReactNode;
  railExtra?: ReactNode;
  onShowTimeline?: () => void;
  captureLabel?: string;
  headerVariant?: "full" | "compact" | "hidden";
  navigation?: ReactNode;
  /** A toolbar-first layout for embedded desktop hosts. */
  compact?: boolean;
  renderDatePicker?: (props: { value: string; min: string; max: string; onChange: (value: string) => void }) => ReactNode;
  palette?: TimelinePalette;
}) {
  const { t, duration, locale } = useI18n();
  const [loadedData, setData] = useState<Capture | null>(null);
  const rawData = capture ?? loadedData;
  const [categoryColors, setCategoryColors] = useState(true);
  const [activityGrouping, setActivityGrouping] = useState<"apps" | "categories">("apps");
  const classification = useMemo(() => categories ? categoryResolver(categories) : null, [categories]);
  const data = useMemo(() => {
    if (!rawData || !categories || !categoryColors) return rawData;
    const resolver = categoryResolver(categories);
    return { ...rawData, apps: rawData.apps.map(app => ({ ...app, color: resolver.color(resolver.resolve(app)) })) };
  }, [rawData, categories, categoryColors]);
  const { clock, dateLabel } = useCaptureTime(data);
  const metricInfo = useMemo(() => Object.fromEntries([...new Set([...Object.keys(defaultMetricInfo), ...Object.keys(data?.metricOverrides ?? {})])].map((key) => [key, getMetricInfo(data,key as keyof typeof defaultMetricInfo)])) as typeof defaultMetricInfo,[data]);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [localView, setLocalView] = useState<Range>(capture?.initialView ?? {
    start: 6 * DAY + 6 * 3600,
    end: 7 * DAY,
  });
  const view = history?.view ?? localView;
  const setView = (next: Range | ((current: Range) => Range)) => {
    const value = typeof next === "function" ? next(view) : next;
    if (history) history.onView(value); else setLocalView(value);
  };
  const [localSelection, setLocalSelection] = useState<Range | null>(null);
  const selection = history ? history.selection : localSelection;
  const setSelection = (range: Range | null) => history ? history.onSelection(range) : setLocalSelection(range);
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
  const [preset, setPreset] = useState(capture?.kind === "recorded" ? "1 hour" : "Day");
  const [follow, setFollow] = useState(capture?.kind === "recorded");
  useEffect(() => {
    if (capture) return;
    let active = true;
    setLoadError(false);
    Promise.resolve().then(() => provider.load()).then((result) => {
      if (active) {
        setData(result);
        if (result.initialView) setView(clampRange(result.initialView, result.bounds));
      }
    }).catch(() => {
      if (active) setLoadError(true);
    });
    return () => {
      active = false;
    };
  }, [provider, loadAttempt, !!capture]);
  useEffect(() => {
    if (data?.kind !== "recorded" || history) return;
    setView(current => followRange(current, data.initialView?.end ?? data.bounds.end, data.bounds)); setSelection(null); setFocus(null); setTab(data.activity.length || data.background.length || data.afk.length ? "Activity" : "Performance");
    setFollow(calendar?.value === calendar?.max);
  }, [data?.epoch, data?.kind, !!(data?.metrics.length || data?.media.length || data?.activity.length || data?.background.length || data?.afk.length)]);
  useEffect(() => {
    if (follow && data?.kind === "recorded" && data.initialView && calendar?.value === calendar?.max) setView(current => followRange(current, data.initialView!.end, data.bounds));
  }, [data,follow,calendar?.value,calendar?.max]);
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
  const [settledStats, setSettledStats] = useState({ data, range, selected: !!selection });
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledStats({ data, range, selected: !!selection }), 100);
    return () => window.clearTimeout(timer);
  }, [data, range, !!selection]);
  // Keep labels and values on the same range while interaction takes priority.
  const statsRange = history?.analysis?.range ?? (settledStats.data === data ? settledStats.range : range);
  const statsSelected = history ? !!selection : settledStats.data === data ? settledStats.selected : !!selection;
  const overview = useMemo(() => (data && !history ? overviewPath(data) : ""), [data, !!history]);
  const stats = useMemo(
    () => history?.analysis?.stats ?? (data ? analyze(data, statsRange) : null),
    [data, statsRange, history?.analysis?.stats],
  );
  const displayApps = useMemo(() => applicationGroups(categories, stats?.apps ?? []), [categories, stats]);
  const focusIds = useMemo(() => displayApps.find(app => app.memberIds.includes(focus ?? ""))?.memberIds, [displayApps, focus]);
  const categoryStats = useMemo(() => categories && stats ? categoryTotals(categories, stats.apps) : [], [categories, stats]);
  const categoryApps = useMemo(() => categories && stats ? categoryApplications(categories, stats.apps) : null, [categories, stats]);
  if (!data || !stats)
    return (
      <main className="tx-app tx-loading">
        <Activity size={28} />
        <p role={loadError ? "alert" : "status"}>
          {t(loadError ? "Could not load this capture. Please try again." : "Preparing your activity timeline…")}
        </p>
        {loadError && <button className="tx-button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{t("Try again")}</button>}
      </main>
    );
  const selectedApp = displayApps.find((a) => a.memberIds.includes(focus ?? ""));
  const coverage = data.kind === "recorded" ? Math.max(0, ...Object.values(stats.metrics).map((metric) => metric.coverage)) : stats.metrics.cpu.coverage;
  const recorded = data.kind === "recorded";
  const transferSize = (value: number) => recorded
    ? value >= 1024 ? `${(value / 1024).toFixed(2)} GiB` : `${value.toFixed(1)} MiB`
    : bytes(value);
  const dateProps = calendar ? { ...calendar,onChange:(value:string)=>{setFollow(false);setSelection(null);calendar.onChange(value)} } : { value: `2026-10-${String(day + 8).padStart(2, "0")}`, min: "2026-10-08", max: "2026-10-14", onChange: (value: string) => navigate(Number(value.slice(-2)) - 8,"Day") };
  const shiftDate = (offset: number) => {
    const date = new Date(`${dateProps.value}T12:00:00`); date.setDate(date.getDate() + offset);
    dateProps.onChange(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`);
  };
  const navigate = (nextDay: number, nextPreset = preset) => {
    if (recorded) {
      setFollow(false);
      setPreset(nextPreset); setSelection(null);
      const center = Math.min(data.bounds.end - 1800, Math.max(1800, (view.start + view.end)/2));
      const span=nextPreset==="Week"?7*DAY:nextPreset==="Month"?30*DAY:nextPreset==="1 hour"?3600:DAY;
      setView(history ? clampRange({start:(view.start+view.end-span)/2,end:(view.start+view.end+span)/2},data.bounds) : nextPreset === "1 hour" ? clampRange({start:center-1800,end:center+1800},data.bounds) : data.bounds);
      return;
    }
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
  const changeView = (next: Range, overviewContext?: Range) => {
    setFollow(false);
    if (overviewContext && history?.onOverviewView) history.onOverviewView(next, overviewContext);
    else setView(next);
    setPreset("Custom");
    setDay(Math.min(6, Math.floor((next.start + next.end) / 2 / DAY)));
  };
  const zoom = (factor: number) =>
    changeView(
      zoomRange(view, factor, (view.start + view.end) / 2, data.bounds),
    );
  const exportBlocked = exporting || !!history && (!history.analysis || history.loading || history.analysis.pending || statsRange.start!==range.start || statsRange.end!==range.end);
  const exportSelection = async () => {
    if (exporting) return;
    // Export always uses the current selection, including during the debounce window.
    if(history && (history.loading || history.analysis?.pending || statsRange.start!==range.start || statsRange.end!==range.end))return;
    const exportStats = statsRange.start===range.start && statsRange.end===range.end ? stats : analyze(data, range);
    const payload: RangeExport = {
      source: data.source ?? "Tracel simulated capture",
      epoch: data.epoch,
      range,
      analytics: exportStats,
      ...(categories ? { classification: { config: categories, totals: categoryTotals(categories, exportStats.apps) } } : {}),
      ...(recorded ? {
        apps: data.apps,
        activity: data.activity.filter((a) => overlap(a,range) > 0).map((a) => ({...a,start:Math.max(a.start,range.start),end:Math.min(a.end,range.end),contexts:a.contexts.filter((c) => overlap(c,range)>0).map((c) => ({...c,start:Math.max(c.start,range.start),end:Math.min(c.end,range.end)}))})),
        background: data.background.filter((a) => overlap(a,range)>0).map((a) => ({...a,start:Math.max(a.start,range.start),end:Math.min(a.end,range.end)})),
        afk: data.afk.filter((a) => overlap(a,range)>0).map((a) => ({...a,start:Math.max(a.start,range.start),end:Math.min(a.end,range.end)})),
        metrics: data.metrics.filter((s) => s.time < range.end && sampleEnd(s,data.samplePeriod) > range.start).map((s) => ({...s,time:Math.max(s.time,range.start),end:Math.min(sampleEnd(s,data.samplePeriod),range.end)})),
        media: exportStats.media.map((m) => ({...m,start:Math.max(m.start,range.start),end:Math.min(m.end,range.end)})),
        metricUnits: Object.fromEntries(Object.entries(metricInfo).map(([key, info]) => [key, { value: info.unit, integral: info.unit === "MiB/s" ? "MiB" : `${info.unit}·s` }])),
      } : {}),
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
      {headerVariant !== "hidden" && <header className={`tx-header${headerVariant === "compact" ? " tx-header-compact" : ""}`}>
        {headerVariant === "full" && <>
        <a href={homeHref} className="tx-brand">
          <span className="tx-brand-mark">
            <Activity size={23} />
          </span>
          tracel
          <span className="tx-brand-divider" />
        </a>
        <span className="tx-workspace">
          <Monitor size={14} /> {" "}{t("Personal workspace")}{" "}<ChevronRight size={12} />{" "}
          <strong>{t("Explorer")}</strong>
        </span>
        </>}
        <div className="tx-header-end">
          <span className="tx-demo">
            <i /> {captureLabel}
          </span>
          <span className="tx-machine">
            {machineLabel ?? <>{t("DESKTOP–ALEX")}{" "}<span>/</span> {" "}{t("Windows 11")}</>}
          </span>
          {headerActions}
          <button
            className="tx-icon-button"
            title={t("Keyboard shortcuts")}
            aria-label={t("Keyboard shortcuts")}
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={17} />
          </button>
          {headerVariant === "full" && <span className="tx-avatar">A</span>}
        </div>
      </header>}
      <div className="tx-shell">
        {navigation ?? <nav className="tx-rail" aria-label={t("Explorer navigation")}>
          <button
            className={pageContent ? undefined : "tx-rail-active"}
            title={t("Timeline explorer")}
            aria-label={t("Timeline explorer")}
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
            title={t("Application analytics")}
            aria-label={t("Application analytics")}
            onClick={() => {
              onShowTimeline?.();
              setInspector(true);
              setTab("Activity");
            }}
          >
            <Command size={19} />
          </button>
          <button
            title={t("Performance analytics")}
            aria-label={t("Performance analytics")}
            onClick={() => {
              onShowTimeline?.();
              setInspector(true);
              setTab("Performance");
            }}
          >
            <SlidersHorizontal size={19} />
          </button>
          <button
            title={t("Media sessions")}
            aria-label={t("Media sessions")}
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
            <span>{t("LOCAL")}</span>
            <Monitor size={18} />
            <i />
          </div>
        </nav>}
        <section className={`tx-main${compact && !pageContent ? " tx-main-timeline" : ""}`}>
          {pageContent ?? <>
          {!compact && <div className="tx-page-heading">
            <div>
              <div className="tx-eyebrow">{t("YOUR COMPUTER, IN CONTEXT")}</div>
              <h1>
                {t("Activity explorer")}<span className="tx-version">{t("BETA")}</span>
              </h1>
              <p>
                {t("A complete picture of your time. Every app, every resource, one timeline.")}</p>
            </div>
            <div className="tx-export-actions">
              <button className="tx-button" onClick={exportSelection} disabled={exportBlocked}>
                <Download size={14} /> {t(exporting ? "Saving…" : "Export range")}
              </button>
              {exportError && <span role="alert">{t("Could not save the export. Please try again.")}</span>}
            </div>
          </div>}
          <div className="tx-toolbar">
            <div className="tx-date-controls">
              <button
                className="tx-icon-button"
                aria-label={t("Previous day")}
                disabled={recorded ? dateProps.value <= dateProps.min : day === 0}
                onClick={() => recorded ? shiftDate(-1) : navigate(day - 1, "Day")}
              >
                <ChevronLeft size={15} />
              </button>
              {renderDatePicker ? renderDatePicker(dateProps) : <label className="tx-date">
                <CalendarDays size={14} />
                <input
                  aria-label={t("Capture date")}
                  type="date"
                  min={dateProps.min}
                  max={dateProps.max}
                  value={dateProps.value}
                  onChange={(e) => {
                    if (e.target.value)
                      dateProps.onChange(e.target.value);
                  }}
                />
              </label>}
              <button
                className="tx-icon-button"
                aria-label={t("Next day")}
                disabled={recorded ? dateProps.value >= dateProps.max : day === 6}
                onClick={() => recorded ? shiftDate(1) : navigate(day + 1, "Day")}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            {!recorded && <button
              className="tx-text-button"
              onClick={() => navigate(6, "Day")}
            >
              {t("Today")}</button>}
            <div className="tx-separator" />
            <div className="tx-segmented">
              {["1 hour", "Day", "Week", ...(history?["Month"]:[])].map((p) => (
                <button
                  className={preset === p ? "active" : ""}
                  key={t(p)}
                  disabled={recorded && !history && p === "Week"}
                  title={recorded && !history && p === "Week" ? t("Week view requires multi-day history queries") : undefined}
                  onClick={() => navigate(day, p)}
                >
                  {t(p)}
                </button>
              ))}
            </div>
            {recorded && <><div className="tx-separator" /><button className="tx-text-button" aria-pressed={follow} title={t(follow ? "Pause live following" : "Jump to today and follow new records")} onClick={() => {
              if (follow) { setFollow(false); return; }
              calendar?.onChange(calendar.max); setFollow(true); setSelection(null);
              if (calendar?.value === calendar?.max) setView(current => followRange(current, data.initialView?.end ?? data.bounds.end, data.bounds));
            }}><Radio size={14} opacity={follow ? 1 : 0.35} />{t("Live")}</button></>}
            <div className="tx-toolbar-space" />
            {compact && <>
              <button className="tx-icon-button" aria-label={t("Keyboard shortcuts")} title={t("Keyboard shortcuts")} onClick={() => setHelp(true)}><HelpCircle size={16} /></button>
              <button className="tx-icon-button" onClick={exportSelection} disabled={exportBlocked} aria-label={t("Export range")} title={t(exporting ? "Saving range..." : "Export range")}>
                <Download size={16} />
              </button>
            </>}
            <div className="tx-settings-anchor">
              <button
                className={`tx-button ${settings ? "tx-settings-active" : ""}`}
                aria-label={t("Display settings")}
                aria-expanded={settings}
                onClick={() => setSettings(!settings)}
              >
                <SlidersHorizontal size={14} /> {" "}{t("Display")}</button>
              {settings && (
                <DisplaySettings
                  categoryColors={categories ? categoryColors : undefined}
                  onCategoryColors={setCategoryColors}
                  value={appearance}
                  onChange={setAppearance}
                  onClose={() => setSettings(false)}
                />
              )}
            </div>
            <div className="tx-segmented tx-tools">
              <button
                title={t("Select range")}
                aria-label={t("Select range")}
                className={mode === "select" ? "active" : ""}
                onClick={() => setMode("select")}
              >
                <MousePointer2 size={14} />
              </button>
              <button
                title={t("Pan timeline")}
                aria-label={t("Pan timeline")}
                className={mode === "pan" ? "active" : ""}
                onClick={() => setMode("pan")}
              >
                <Hand size={14} />
              </button>
            </div>
            <div className="tx-separator" />
            <button
              className="tx-icon-button"
              aria-label={t("Zoom out")}
              onClick={() => zoom(1.5)}
            >
              <Minus size={15} />
            </button>
            <span className="tx-zoom-label">
              {duration(view.end - view.start)}
            </span>
            <button
              className="tx-icon-button"
              aria-label={t("Zoom in")}
              onClick={() => zoom(1 / 1.5)}
            >
              <Plus size={15} />
            </button>
            <button
              className="tx-icon-button"
              aria-label={t("Fit all data")}
              title={t("Fit all data")}
              onClick={() => history ? changeView(history.overviewRange) : navigate(day, "Week")}
            >
              <Maximize2 size={14} />
            </button>
            <button
              className="tx-icon-button"
              aria-label={t("Toggle inspector")}
              title={t("Toggle inspector")}
              onClick={() => setInspector(!inspector)}
            >
              {inspector ? (
                <PanelRightClose size={17} />
              ) : (
                <PanelRightOpen size={17} />
              )}
            </button>
          </div>
          {compact && exportError && <p className="tx-export-error" role="alert">{t("Could not save the export. Please try again.")}</p>}
          {dataError && <p role="alert" className="tx-export-error">{dataError}</p>}
          {!history && data.detailLevel && <p className="tx-note">{t("Aggregated display · Zoom in for precise intervals. Statistics use original records.")}</p>}
          {!history && recorded && !data.metrics.length && !data.media.length && !data.activity.length && !data.background.length && !data.afk.length && <p role="status" className="tx-note">{t("No recorded metrics for this day. Enable collection in Settings.")}</p>}
          {history ? <RecordedOverview data={data} history={history} label={captureLabel} color={metricInfo.cpu.color} onView={changeView} /> : <div className="tx-overview">
            <div className="tx-overview-heading">
              <span>
                <Radio size={12} /> {compact ? captureLabel : "CAPTURE OVERVIEW"}
              </span>

              <span>
                {recorded ? dateLabel(data.bounds.start) : t("OCT 08 – OCT 14, 2026")}{" "}<b>{recorded ? t("Recorded") : t("7 days")}</b>
              </span>
            </div>
            <OverviewViewport data={data} bounds={data.bounds} view={view} onView={changeView}>
              <svg
                viewBox="0 0 1400 44"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {!history && data.activity.map((a) => (
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
                {!history && <path
                  d={overview}
                  fill="none"
                  stroke={metricInfo.cpu.color}
                  strokeWidth="1.2"
                />}
              </svg>
            </OverviewViewport>
            {!recorded && <div className="tx-overview-days">
              {Array.from({ length: 7 }, (_, d) => (
                <button
                  key={d}
                  className={d === day ? "active" : ""}
                  onClick={() => navigate(d, "Day")}
                >
                  {t(["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"][d])}{" "}
                  <span>{8 + d}</span>
                </button>
              ))}
            </div>}
          </div>}
          <div className="tx-content">
            <section className="tx-timeline-panel">
              <div className="tx-timeline-heading" onClick={() => setSelection(null)}>
                <span>
                  <span className="tx-live-dot" /> {" "}{t("Timeline")}{" "}
                  <small>
                    {dateLabel(view.start)} · {clock(view.start)} —{" "}
                    {view.end - view.start > DAY
                      ? dateLabel(view.end - 1)
                      : clock(view.end)}
                  </small>
                </span>
                <span className="tx-timeline-hint">
                  {t(recorded ? "Measured system metrics" : view.end - view.start > DAY * 2
                    ? "Aggregated activity"
                    : view.end - view.start < 7200
                      ? "Context detail"
                      : "Application intervals")}{" "}
                  <span>·</span> {" "}{t(recorded ? "2s nominal samples" : "30s samples")}</span>
              </div>
              <Timeline
                renderTrackHeaders={renderTrackHeaders}
                data={data}
                view={view}
                selection={selection}
                mode={mode}
                focus={focus}
                focusIds={focusIds}
                appearance={appearance}
                palette={palette}
                hiddenSources={hiddenSources}
                onView={changeView}
                onSelect={(range) => { setSelection(range); if (range) setFollow(false); }}
                onFocus={setFocus}
              />
              <div className="tx-timeline-bottom">
                <span>
                  <MousePointer2 size={12} /> {" "}{t("Drag to select")}{" "}<kbd>Alt</kbd> {" "}{t("drag to pan")}{" "}<span>·</span> {" "}{t("Scroll to zoom")}</span>
                <button
                  className="tx-text-button"
                  onClick={() => setHelp(true)}
                >
                  {t("Shortcuts")}{" "}<HelpCircle size={12} />
                </button>
              </div>
            </section>
            {inspector && (
              <aside className="tx-inspector" aria-busy={!!history?.analysis?.pending || statsRange.start!==range.start || statsRange.end!==range.end}>
                <div className="tx-inspector-title">
                  <span>
                    <Focus size={15} />{" "}
                    {t(statsSelected ? "Selection inspector" : "Range overview")}
                  </span>
                  {selection ? (
                    <button
                      aria-label={t("Clear selection")}
                      className="tx-icon-button"
                      onClick={() => setSelection(null)}
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <span className="tx-small-badge">{t("VISIBLE RANGE")}</span>
                  )}
                </div>
                <div className="tx-range">
                  <strong>
                    {duration(statsRange.end - statsRange.start)}{" "}
                    <small>
                      {t(statsSelected ? "Selected duration" : "Visible duration")}
                    </small>
                  </strong>
                  <div>
                    {dateLabel(statsRange.start)}
                    {Math.floor(statsRange.start / DAY) !==
                    Math.floor(statsRange.end / DAY)
                      ? ` – ${dateLabel(statsRange.end)}`
                      : ""}{" "}
                    <span>
                      {clock(statsRange.start, true)} — {clock(statsRange.end, true)}
                    </span>
                  </div>
                  {selection && (
                    <button
                      className="tx-button"
                      onClick={() =>
                        changeView(clampRange(selection, data.bounds))
                      }
                    >
                      <Maximize2 size={12} /> {" "}{t("Zoom to selection")}</button>
                  )}
                </div>
                <div className="tx-tabs">
                  {(["Activity", "Performance", "Media"] as const).map((tabLabel) => (
                    <button
                      className={tab === tabLabel ? "active" : ""}
                      key={tabLabel}
                      onClick={() => setTab(tabLabel)}
                    >
                      {t(tabLabel)}
                    </button>
                  ))}
                </div>
                <div className="tx-inspector-body">
                  {tab === "Activity" && (
                    <>
                      <div className="tx-active-summary">
                        <div>
                          <label>
                            <i /> {" "}{t("Active time")}</label>
                          <strong>{duration(stats.active)}</strong>
                        </div>
                        <div>
                          <label>
                            <i className="tx-idle-dot" /> {" "}{t("Idle / AFK")}</label>
                          <strong>{duration(stats.afk)}</strong>
                        </div>
                      </div>
                      <div className="tx-proportion">
                        {displayApps
                          .filter((a) => a.active > 0)
                          .map((a) => (
                            <button
                              title={`${a.name}: ${duration(a.active)}`}
                              aria-label={t("Focus {app}", { app: a.name })}
                              key={a.id}
                              style={{
                                width: `${(a.active / Math.max(1, stats.active)) * 100}%`,
                                background: a.color,
                              }}
                              onClick={() =>
                                setFocus(a.memberIds.includes(focus ?? "") ? null : a.id)
                              }
                            />
                          ))}
                      </div>
                      {categories && <div className="tx-segmented tx-category-grouping" aria-label={t("Activity grouping")}>
                        <button className={activityGrouping === "apps" ? "active" : ""} onClick={() => setActivityGrouping("apps")}>{t("Applications")}</button>
                        <button className={activityGrouping === "categories" ? "active" : ""} onClick={() => { setActivityGrouping("categories"); setFocus(null); }}>{t("Categories")}</button>
                      </div>}
                      {activityGrouping === "categories" && categories ? <div className="tx-category-list">
                        {categoryStats.map(category => {
                          const percent = category.active / Math.max(1, stats.active) * 100;
                          const members = categoryApps?.get(category.id) ?? [];
                          const hasChildren = categories.categories.some(item => item.parent_id === category.id);
                          return <details className="tx-category-row" key={category.id} open={!hasChildren} style={{ marginLeft: category.depth * 12 }}>
                            <summary className="tx-category-heading" title={`${classification?.lineage(category).map(item => t(item.name)).join(" / ")} · ${t("of active time")}${hasChildren ? ` · ${t("Includes subcategories")}` : ""}`}>
                              <span><ChevronRight className="tx-category-chevron" size={12} /><i style={{ background: category.color }} /><span>{t(category.name)}</span><small className="tx-category-count" aria-label={t("Apps: {count}", { count: members.length })}>{members.length}</small></span>
                              <strong>{duration(category.active)}<small>{Math.round(percent)}%</small></strong>
                            </summary>
                            <div className="tx-category-bar" role="meter" aria-label={t(category.name)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(percent.toFixed(1))} aria-valuetext={`${percent.toFixed(1)}% ${t("of active time")}`}><i style={{ width: `${percent}%`, background: category.color }} /></div>
                            <div className="tx-app-list tx-category-apps">
                              {members.map(app => <button key={app.id} className={app.memberIds.includes(focus ?? "") ? "selected" : ""} aria-pressed={app.memberIds.includes(focus ?? "")} onClick={() => setFocus(app.memberIds.includes(focus ?? "") ? null : app.id)} title={`${app.exe} · ${t("Focus {app}", { app: app.name })}`}>
                                <span className="tx-app-icon" style={{ color: app.color, background: app.color + "15" }}>{renderAppIcon ? renderAppIcon(app, <AppIcon id={app.id} />) : <AppIcon id={app.id} />}</span>
                                <span className="tx-app-name">{app.name}{hasChildren && <small className="tx-app-category">{classification?.lineage(classification.resolve(app)).map(item => t(item.name)).join(" / ")}</small>}</span>
                                <span className="tx-app-duration" title={duration(app.active)}>{duration(app.active, true)}<small>{Math.round(app.active / Math.max(1, stats.active) * 100)}%</small></span>
                              </button>)}
                            </div>
                          </details>;
                        })}
                        {!categoryStats.length && <p className="tx-empty">{t("No active time in this range.")}</p>}
                      </div> : <>
                      <div className="tx-section-heading">
                        {t("APPLICATIONS")}{" "}<span>{t("ACTIVE TIME")}</span>
                      </div>
                      <div className="tx-app-list">
                        {displayApps
                          .filter((a) => a.foreground > 0)
                          .map((a) => (
                            <button
                              className={a.memberIds.includes(focus ?? "") ? "selected" : ""}
                              key={a.id}
                              onClick={() =>
                                setFocus(a.memberIds.includes(focus ?? "") ? null : a.id)
                              }
                            >
                              <span
                                className="tx-app-icon"
                                style={{
                                  color: a.color,
                                  background: a.color + "15",
                                }}
                              >
                                {renderAppIcon ? renderAppIcon(a, <AppIcon id={a.id} />) : <AppIcon id={a.id} />}
                              </span>
                              <span className="tx-app-name">
                                {a.name}
                                {classification && <small className="tx-app-category">{classification.lineage(classification.resolve(a)).map(item => t(item.name)).join(" / ")}</small>}
                                <span className="tx-app-bar">
                                  <i
                                    style={{
                                      width: `${(a.active / Math.max(1, displayApps[0].active)) * 100}%`,
                                      background: a.color,
                                    }}
                                  />
                                </span>
                              </span>
                              <span className="tx-app-duration" title={duration(a.active)}>
                                {duration(a.active, true)}
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
                      </>}
                      <div className="tx-stat-line">
                        <span>{t("App switches")}</span>
                        <strong>{stats.switches}</strong>
                      </div>
                      <div className="tx-stat-line">
                        <span>{t("Foreground duration")}</span>
                        <strong>{duration(stats.foreground)}</strong>
                      </div>
                      {!stats.foreground && (
                        <p className="tx-empty">
                          {t("No foreground activity in this range. Navigate to a recorded work session.")}</p>
                      )}
                      <div className="tx-section-heading">
                        {selectedApp
                          ? t("{app} CONTEXT", { app: selectedApp.name.toUpperCase() })
                          : t("ASSOCIATED CONTEXT")}
                        {focus && (
                          <button
                            className="tx-text-button"
                            onClick={() => setFocus(null)}
                          >
                            {t("Clear")}</button>
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
                        {t("SYSTEM RESOURCES")}{" "}<span>{t("AVG / PEAK")}</span>
                      </div>
                      {(["cpu", "ram", "gpu"] as const).filter((key) => !recorded || key !== "gpu" || data.metrics.some((sample) => sample.values?.gpu != null)).map((key) => (
                        <div className="tx-performance-stat" key={key}>
                          <label>
                            <i style={{ background: metricInfo[key].color }} />
                            {t(metricInfo[key].name)}
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
                        {t("TRANSFER TOTALS")}{" "}<span>{t("IN RANGE")}</span>
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
                              {t(metricInfo[key].name)}
                            </span>
                            <strong>
                              {stats.metrics[key].coverage ? transferSize(stats.metrics[key].total) : "—"}
                            </strong>
                            <small>
                              {t("Avg")}{" "}
                              {stats.metrics[key].average?.toFixed(2) ?? "—"} {" "}{t("· Peak")}{" "}{stats.metrics[key].peak?.toFixed(2) ?? "—"}{" "}
                              {metricInfo[key].unit}
                            </small>
                          </div>
                        ),
                      )}
                      <p className="tx-note">
                        {t("Time-weighted statistics from system samples. Gaps and sleep are excluded; zero values are included.")}</p>
                    </>
                  )}
                  {tab === "Media" && (
                    <>
                      <div className="tx-section-heading">
                        {t("MEDIA SESSIONS")}{" "}<span>{stats.media.length}</span>
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
                            title={t("Show media interval")}
                            aria-label={t("Show {title} interval", { title: m.title })}
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
                          {t("No media sessions in this range.")}</p>
                      )}
                      <p className="tx-note">
                        {t("Media session metadata and system audio levels are recorded independently. Playback duration is clipped to this range.")}</p>
                    </>
                  )}
                </div>
                <div className="tx-inspector-foot">
                  <span className="tx-live-dot" />{" "}
                  {(
                    (coverage / Math.max(0.001, statsRange.end - statsRange.start)) *
                    100
                  ).toFixed(1)}
                  {t(recorded ? "% best metric coverage" : "% metric coverage")}{" "}<span>{t("System subject")}</span>
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
                <Cpu size={17} />
              </span>
              <label>
                {t("CPU AVERAGE")}<strong>
                  {stats.metrics.cpu.average?.toFixed(1) ?? "—"}
                  <small>%</small>
                </strong>
              </label>
              <span className="tx-summary-detail">
                {t("Peak")}{" "}{stats.metrics.cpu.peak?.toFixed(0) ?? "—"}%
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
                <MemoryStick size={17} />
              </span>
              <label>
                {t("MEMORY AVERAGE")}<strong>
                  {stats.metrics.ram.average?.toFixed(1) ?? "—"}
                  <small>{metricInfo.ram.unit}</small>
                </strong>
              </label>
              <span className="tx-summary-detail">{recorded ? `${metricInfo.ram.max.toFixed(1)} ${metricInfo.ram.unit}` : t("of 32 GB")}</span>
            </div>
            <div>
              <span
                className="tx-summary-icon"
                style={{
                  color: metricInfo.download.color,
                  background: metricInfo.download.color + "18",
                }}
              >
                <Download size={18} />
              </span>
              <label>
                {t("DOWNLOADED")}<strong>
                  {stats.metrics.download.coverage ? transferSize(stats.metrics.download.total) : "—"}
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
                <HardDrive size={17} />
              </span>
              <label>
                {t("DISK WRITTEN")}<strong>
                  {stats.metrics.write.coverage ? transferSize(stats.metrics.write.total) : "—"}
                </strong>
              </label>
            </div>
          </section>
          <footer className="tx-status">
            <span>
              <span className="tx-live-dot" /> {localDataLabel}{" "}
              <span>·</span> {" "}{t(recorded ? "SQLite · saved locally" : "Deterministic demo")}</span>
            <span>
              {data.metrics.length.toLocaleString(locale === "en" ? "en-US" : locale)} {" "}{t(recorded ? "metric intervals" : "samples")}{" "}
              <span>·</span> {data.activity.length} {" "}{t("intervals")}{" "}<span>·</span>{" "}
              {t(selection ? "Selection statistics" : "Visible range statistics")}
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
            aria-label={t("Timeline shortcuts")}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setHelp(false);
            }}
          >
            <button
              className="tx-icon-button"
              aria-label={t("Close shortcuts")}
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <h2>{t("Explore at your own pace.")}</h2>
            <p>{t("One time coordinate, across every track.")}</p>
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
                <span>{t(action)}</span>
                <kbd>{t(key)}</kbd>
              </div>
            ))}
            <p>
              {t(recorded ? "Drag track edges to resize. Blank regions indicate missing or disabled measurements. Media intervals are estimated from snapshots." : "Expand foreground activity to see files and URLs. Drag a track label’s lower edge to resize it. Blank metric regions indicate sleep or missing samples. Demo dates: October 8–14, 2026.")}</p>
          </section>
        </div>
      )}
    </main>
  );
}
