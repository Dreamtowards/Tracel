import { X } from "lucide-react";
import { I18nProvider, useI18n } from "@tracel/timeline";
import { desktopZh } from "./messages.zh";
import { Button } from "./components/ui/Button";
import DatePicker from "./DatePicker";
import { accentForeground } from "./theme";
import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Explorer, type RangeExport } from "@tracel/timeline";
import { demoProvider } from "@tracel/timeline/mock";
import { getAppInfo, nativeClient, saveRange, type AppInfo } from "./native";
import Utilities from "./Utilities";
import Settings from "./Settings";
import SystemMetrics from "./SystemMetrics";
import Audio from "./Audio";
import { useAudioMonitor } from "./useAudioMonitor";
import { useMediaSessions } from "./useMediaSessions";
import { useRecordedTimeline } from "./useRecordedTimeline";
import { useCollection } from "./useCollection";
import { useAppearance } from "./useAppearance";
import Navigation, { type Page } from "./Navigation";

class ClientBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Recovery />;
    return this.props.children;
  }
}
function Recovery() {
  const { t } = useI18n();
  return (
      <main className="desktop-recovery">
        <h1>{t("Let’s reopen your timeline.")}</h1>
        <p>{t("The view could not be displayed. Your exported files are unaffected.")}</p>
        <Button onClick={() => window.location.reload()}>{t("Reload client")}</Button>
      </main>
    );
}

export default function App() {
  const appearance = useAppearance();
  return <I18nProvider locale={appearance.language} messages={desktopZh}><DesktopApp appearance={appearance} /></I18nProvider>;
}
function DesktopApp({ appearance }: { appearance: ReturnType<typeof useAppearance> }) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState<Page>("timeline");
  const palette = useMemo(() => ({ background: "#111113", grid: "#232326", divider: "#29292d", group: "#19191c", focus: `${appearance.accent}12`, selection: appearance.accent, text: "#ececef", muted: "#a1a1aa" }), [appearance.accent]);
  useLayoutEffect(() => {
    // Body portals inherit the same theme; their dimensions scale without a zoomed positioning ancestor.
    document.documentElement.lang = locale;
    const root = document.documentElement.style;
    root.setProperty("--primary", appearance.accent);
    root.setProperty("--primary-foreground", accentForeground(appearance.accent));
    root.setProperty("--ui-scale", String(appearance.zoom / 100));
  }, [appearance.accent, appearance.zoom, locale]);
  const ui = useRef<HTMLDivElement>(null);
  useEffect(() => { ui.current?.querySelector(".tx-main")?.scrollTo(0, 0); }, [page]);
  const collection = useCollection(page === "metrics");
  const audio = useAudioMonitor(page === "audio");
  const media = useMediaSessions(page === "audio" && !!audio.status?.monitoring);
  const timeline = useRecordedTimeline(page === "timeline");
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
    const outcome = await saveRange(payload, t("Export timeline range"));
    setNotice(outcome === "saved" ? "Timeline range saved to your chosen file." : "Export cancelled. No file was written.");
  };
  return (
    <ClientBoundary>
      <div ref={ui} className="desktop-ui" style={{ "--ui-scale": appearance.zoom / 100 } as CSSProperties}>
      <Explorer
        provider={demoProvider}
        capture={nativeClient ? timeline.capture : undefined}
        calendar={nativeClient ? timeline.calendar : undefined}
        dataError={nativeClient ? (timeline.error || (collection.status?.storageError ? `${t("Storage unavailable:")} ${collection.status.storageError}` : "")) : undefined}
        homeHref="/"
        localDataLabel={t("All data stays on this device")}
        machineLabel={info ? `${info.deviceName} / ${info.platform === "windows" ? "Windows" : info.platform}` : t(nativeClient ? "This device" : "Desktop preview")}
        headerVariant="hidden"
        compact
        renderDatePicker={(props) => <DatePicker {...props} />}
        palette={palette}
        onExport={nativeClient ? exportRange : undefined}
        onShowTimeline={() => setPage("timeline")}
        captureLabel={t(nativeClient ? "Recorded metrics" : "Demo capture")}
        navigation={<Navigation page={page} expanded={appearance.expanded} width={appearance.navigationWidth} onWidth={appearance.setNavigationWidth} onToggle={appearance.toggleNavigation} onNavigate={setPage} onAbout={() => about.current?.showModal()} />}
        pageContent={page === "audio" ? <Audio monitor={audio} media={media} /> : page === "settings" ? <Settings status={collection.status} busy={collection.busy} error={collection.error} onSettings={collection.changeSettings} zoom={appearance.zoom} onZoom={appearance.setZoom} accent={appearance.accent} onAccent={appearance.setAccent} language={appearance.language} onLanguage={appearance.setLanguage} /> : page === "utilities" ? <Utilities status={collection.status} busy={collection.busy} error={collection.error} onAwake={collection.changeAwake} /> : page === "metrics" ? <SystemMetrics status={collection.status} history={collection.history} error={collection.error} onSettings={() => setPage("settings")} /> : undefined}
      />
      <div className="desktop-notice" role="status" aria-live="polite">{t(notice)}</div>
      <dialog ref={about} className="desktop-about" onClick={(event) => { if (event.target === event.currentTarget) about.current?.close(); }}>
        <div className="desktop-about-heading"><h1>Tracel Activity</h1><Button aria-label={t("Close about client")} onClick={() => about.current?.close()}><X size={16} /></Button></div>
        <dl>
          <div><dt>{t("Client")}</dt><dd>{t(nativeClient ? "Windows desktop" : "Browser preview")}{info ? ` · ${info.version}` : ""}</dd></div>
          <div><dt>{t("Device")}</dt><dd>{info?.deviceName ?? t("This device")}</dd></div>
          <div><dt>{t("Timeline")}</dt><dd>{t(nativeClient ? "Local SQLite history" : "Demo · October 8–14, 2026")}</dd></div>
        </dl>
        <p className="desktop-about-detail">{t("Measurements stay on this device. Closing Tracel stops collection and releases sleep prevention.")}</p>
        {infoError && <p role="status">{t("Device information is unavailable. The demo remains available.")}</p>}
        <form method="dialog"><Button type="submit" variant="secondary" autoFocus>{t("Close")}</Button></form>
      </dialog>
      </div>
    </ClientBoundary>
  );
}
