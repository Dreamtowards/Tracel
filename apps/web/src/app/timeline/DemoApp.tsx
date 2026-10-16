"use client";

import { useState, type CSSProperties } from "react";
import { I18nProvider, useI18n, defaultCategories, parseCategories, type DataProvider } from "@tracel/timeline";
import { DesktopExplorer, Navigation, CollectionMenu, useAppearance, useDesktopTheme, desktopZh, type Page, type CollectionSettings } from "@tracel/timeline/desktop";
import { desktopDemoProvider } from "@tracel/timeline/desktop-demo";
import Audio from "@tracel/timeline/desktop/Audio";
import Utilities from "@tracel/timeline/desktop/Utilities";
import SystemMetrics from "@tracel/timeline/desktop/SystemMetrics";
import Settings from "@tracel/timeline/desktop/Settings";
import { TooltipProvider } from "@tracel/timeline/desktop/components/ui/InfoTip";
import "./demo.css";

const demoSettings: CollectionSettings = { enabled: true, foreground: true, background: true, idle: true, cpu: true, cpuFrequency: true, ram: true, gpu: true, network: true, disk: true, battery: true, audioInput: true, audio: true, media: true };
const categories = parseCategories(defaultCategories);

/** Supply a different provider to inject another example dataset into the same UI. */
export default function DemoApp({ provider = desktopDemoProvider }: { provider?: DataProvider }) {
  const appearance = useAppearance({ key: "tracel.web.demo.appearance", language: "zh-CN", zoom: 100 });
  return <TooltipProvider delayDuration={250}><I18nProvider locale={appearance.language} messages={desktopZh}><DemoExperience provider={provider} appearance={appearance} /></I18nProvider></TooltipProvider>;
}

function DemoExperience({ provider, appearance }: { provider: DataProvider; appearance: ReturnType<typeof useAppearance> }) {
  const { t, locale } = useI18n();
  useDesktopTheme(appearance.accent, appearance.zoom, locale);
  const [page, setPage] = useState<Page>("timeline");
  const [settings, setSettings] = useState(demoSettings);
  return <div className="web-demo">
    <div className="demo-banner"><a href="/">← Tracel</a><span>{t("Online demo · All data is fabricated. No device monitoring.")}</span></div>
    <div className="desktop-ui" style={{ "--ui-scale": appearance.zoom / 100 } as CSSProperties}>
      <DesktopExplorer accent={appearance.accent} provider={provider} categories={categories}
        homeHref="/" localDataLabel={t("Example data only · No device monitoring")} machineLabel={t("Online demo")}
        captureLabel={t("Online demo · Example data")}
        navigation={<Navigation aboutLabel="Back to website" aboutText="Back to website" page={page} expanded={appearance.expanded} width={appearance.navigationWidth} onWidth={appearance.setNavigationWidth} onToggle={appearance.toggleNavigation} onNavigate={setPage} onAbout={() => { window.location.href = "/"; }} />}
        renderTrackHeaders={headers => <CollectionMenu demo status={{ supported: true, settings }} busy={false} onSettings={async next => setSettings(next)} simplifyGpuNames={appearance.simplifyGpuNames} showSoftwareGpus={appearance.showSoftwareGpus} onSimplifyGpuNames={appearance.setSimplifyGpuNames} onShowSoftwareGpus={appearance.setShowSoftwareGpus}>{headers}</CollectionMenu>}
        onShowTimeline={() => setPage("timeline")}
        pageContent={page === "settings" ? <Settings categories={{ config: categories, path: "", error: "" }} status={null} error="" onTimeline={() => setPage("timeline")} language={appearance.language} onLanguage={appearance.setLanguage} zoom={appearance.zoom} onZoom={appearance.setZoom} accent={appearance.accent} onAccent={appearance.setAccent} />
          : page === "audio" ? <Audio monitor={{ status: null, busy: false, error: "", change: async () => {} }} media={{ snapshot: null, loading: false, error: "" }} />
          : page === "utilities" ? <Utilities status={null} busy={false} error="" onAwake={async () => {}} />
          : page === "metrics" ? <SystemMetrics status={null} history={[]} error="" gpuOptions={appearance} onSettings={() => setPage("timeline")} /> : undefined}
      />
    </div>
  </div>;
}
