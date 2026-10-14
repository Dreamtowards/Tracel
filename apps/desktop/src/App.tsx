import DatePicker from "./DatePicker";
import { accentForeground } from "./theme";
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Explorer, type RangeExport } from "@tracel/timeline";
import { demoProvider } from "@tracel/timeline/mock";
import { getAppInfo, nativeClient, saveRange, type AppInfo } from "./native";
import Settings from "./Settings";
import SystemMetrics from "./SystemMetrics";
import { useCollection } from "./useCollection";
import { useAppearance } from "./useAppearance";
import Navigation, { type Page } from "./Navigation";

class ClientBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <main className="desktop-recovery">
        <h1>Let’s reopen your timeline.</h1>
        <p>The view could not be displayed. Your exported files are unaffected.</p>
        <button onClick={() => window.location.reload()}>Reload client</button>
      </main>
    );
    return this.props.children;
  }
}

export default function App() {
  const [page, setPage] = useState<Page>("timeline");
  const appearance = useAppearance();
  const palette = useMemo(() => ({ background: "#111113", grid: "#232326", divider: "#29292d", group: "#19191c", focus: `${appearance.accent}12`, selection: appearance.accent }), [appearance.accent]);
  useLayoutEffect(() => {
    // Body portals inherit the same theme; their dimensions scale without a zoomed positioning ancestor.
    const root = document.documentElement.style;
    root.setProperty("--primary", appearance.accent);
    root.setProperty("--primary-foreground", accentForeground(appearance.accent));
    root.setProperty("--ui-scale", String(appearance.zoom / 100));
  }, [appearance.accent, appearance.zoom]);
  const ui = useRef<HTMLDivElement>(null);
  useEffect(() => { ui.current?.querySelector(".tx-main")?.scrollTo(0, 0); }, [page]);
  const collection = useCollection(page === "metrics");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [notice, setNotice] = useState("");
  const about = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!nativeClient) return;
    let active = true;
    getAppInfo().then((result) => { if (active) setInfo(result); })
      .catch(() => { if (active) setInfoError(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const exportRange = async (payload: RangeExport) => {
    setNotice("");
    const outcome = await saveRange(payload);
    setNotice(outcome === "saved" ? "Timeline range saved to your chosen file." : "Export cancelled. No file was written.");
  };
  return (
    <ClientBoundary>
      <div ref={ui} className="desktop-ui" style={{ "--ui-scale": appearance.zoom / 100 } as CSSProperties}>
      <Explorer
        provider={demoProvider}
        homeHref="/"
        localDataLabel="All data stays on this device"
        machineLabel={info ? `${info.deviceName} / ${info.platform === "windows" ? "Windows" : info.platform}` : nativeClient ? "This device" : "Desktop preview"}
        headerVariant="hidden"
        compact
        renderDatePicker={(props) => <DatePicker {...props} />}
        palette={palette}
        onExport={nativeClient ? exportRange : undefined}
        onShowTimeline={() => setPage("timeline")}
        captureLabel={page === "timeline" ? "Demo capture" : "Local system metrics"}
        navigation={<Navigation page={page} expanded={appearance.expanded} width={appearance.navigationWidth} onWidth={appearance.setNavigationWidth} onToggle={appearance.toggleNavigation} onNavigate={setPage} onAbout={() => about.current?.showModal()} />}
        pageContent={page === "settings" ? <Settings status={collection.status} busy={collection.busy} error={collection.error} onSettings={collection.changeSettings} onAwake={collection.changeAwake} zoom={appearance.zoom} onZoom={appearance.setZoom} accent={appearance.accent} onAccent={appearance.setAccent} /> : page === "metrics" ? <SystemMetrics status={collection.status} history={collection.history} error={collection.error} onSettings={() => setPage("settings")} /> : undefined}
      />
      <div className="desktop-notice" role="status" aria-live="polite">{notice}</div>
      <dialog ref={about} className="desktop-about" onClick={(event) => { if (event.target === event.currentTarget) about.current?.close(); }}>
        <div className="desktop-about-heading"><h1>Tracel Activity</h1><button aria-label="Close about client" onClick={() => about.current?.close()}>×</button></div>
        <dl>
          <div><dt>Client</dt><dd>{nativeClient ? "Windows desktop" : "Browser preview"}{info ? ` · ${info.version}` : ""}</dd></div>
          <div><dt>Device</dt><dd>{info?.deviceName ?? "This device"}</dd></div>
          <div><dt>Timeline</dt><dd>Demo · October 8–14, 2026</dd></div>
        </dl>
        <p className="desktop-about-detail">Measurements stay on this device. Closing Tracel stops collection and releases sleep prevention.</p>
        {infoError && <p role="status">Device information is unavailable. The demo remains available.</p>}
        <form method="dialog"><button autoFocus>Close</button></form>
      </dialog>
      </div>
    </ClientBoundary>
  );
}
