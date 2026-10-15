import { useI18n, type Locale } from "@tracel/timeline";
import { Button } from "./components/ui/Button";
import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getSystemHistory, nativeClient, type CollectionStatus, type SystemObservation } from "./native";

type MetricField = "cpuPercent" | "memoryUsedBytes" | "networkReceiveBytesPerSecond" | "networkSendBytesPerSecond" | "diskReadBytesPerSecond" | "diskWriteBytesPerSecond" | "audioPeakPercent";
function MetricChart({ history, field, second, max, color, label }: { history: SystemObservation[]; field: MetricField; second?: MetricField; max: number; color: string; label?: string }) {
  const { t } = useI18n();
  const points = history.slice(-300);
  const first = points[0]?.capturedAtMs ?? 0;
  const end = Math.max(first + 2000, points.at(-1)?.capturedAtMs ?? first);
  const pathFor = (key: MetricField) => {
    let path = ""; let previous = 0; let connected = false;
    for (const point of points) {
      const value = point[key];
      if (value == null || !Number.isFinite(value)) { connected = false; continue; }
      const x = (point.capturedAtMs - first) / (end - first) * 1000;
      const y = 110 - Math.max(0, Math.min(1, value / Math.max(1, max))) * 100;
      path += `${connected && point.capturedAtMs - previous <= 6000 ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
      connected = true; previous = point.capturedAtMs;
    }
    return path;
  };
  return <svg viewBox="0 0 1000 120" preserveAspectRatio="none" role="img" aria-label={t("{metric} recent measured history", { metric: t(label ?? (field === "cpuPercent" ? "CPU" : "RAM")) })}><path d="M0 110H1000M0 60H1000M0 10H1000" stroke="#293034" fill="none" /><path d={pathFor(field)} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />{second && <path d={pathFor(second)} stroke="#a0a0ab" strokeDasharray="4 3" strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />}</svg>;
}
function rate(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MiB/s`;
  return `${(value / 1024).toFixed(1)} KiB/s`;
}

export default function SystemMetrics({ status, history, error, onSettings }: { status: CollectionStatus | null; history: SystemObservation[]; error: string; onSettings: () => void }) {
  const { t, locale } = useI18n();
  const [exportCount, setExportCount] = useState(0);
  const [exporting, setExporting] = useState(false); const [exportStatus, setExportStatus] = useState("");
  const settings = status?.settings;
  const active = !!(status?.supported && settings?.enabled && (settings.cpu || settings.ram || settings.network || settings.disk || settings.audio || settings.media));
  const latest = status?.latest;
  const memoryCapacity = latest?.memoryTotalBytes ?? [...history].reverse().find((sample) => sample.memoryTotalBytes != null)?.memoryTotalBytes ?? 1;
  const cpu = settings?.enabled && settings.cpu ? latest?.cpuPercent : null;
  const ram = settings?.enabled && settings.ram ? latest?.memoryUsedBytes : null;
  const exportHistory = async () => {
    setExporting(true); setExportStatus("");
    try {
      const samples = await getSystemHistory();
      const path = await save({ title: t("Export recorded system metrics"), defaultPath: "tracel-system-metrics.json", filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path) { setExportStatus("Export cancelled."); return; }
      await writeTextFile(path, JSON.stringify({ source: "Tracel native system metrics", timestampUnit: "UTC Unix milliseconds", cpuUnit: "percent", memoryUnit: "bytes", networkUnit: "bytes per second", diskUnit: "bytes per second", audioUnit: "percent peak amplitude", mediaSource: "Windows SMTC", nominalPeriodMs: 2000, samples }, null, 2));
      setExportCount(samples.length);
      setExportStatus("Saved {count} measured observations.");
    } catch { setExportStatus("Could not save metrics. Please try again."); }
    finally { setExporting(false); }
  };
  return <div className="desktop-page metrics-page">
    <header className="desktop-page-heading"><h1>{t("System metrics")}</h1><div className="metrics-actions"><Button className="tx-button" onClick={onSettings}>{t("Collection settings")}</Button><Button className="tx-button" onClick={() => { void exportHistory(); }} disabled={!nativeClient || exporting || !status?.sampleCount}>{t(exporting ? "Saving…" : "Export measurements")}</Button></div></header>
    <div className="metrics-state"><i className={active ? "active" : ""} />{t(!nativeClient ? "Windows client required" : !status ? "Connecting…" : active ? "Collecting every 2s" : "Paused")}<span>{status?.sampleCount ?? 0} {" "}{t("samples · local")}</span></div>
    {error && <p role="alert" className="settings-error">{t(error)}</p>}
    {!active && <p className="settings-banner">{t("Collection is paused. Enable it in Settings to start.")}</p>}
    <div className="metrics-grid">
      <section className="settings-card"><h2>{t("CPU usage")}</h2><div className="metrics-value">{cpu == null ? "—" : cpu.toFixed(1)}<small>%</small></div><p>{t(!settings?.cpu ? "CPU sampling disabled" : active && cpu == null ? "Warming up…" : "System utilization")}</p><MetricChart history={history} field="cpuPercent" max={100} color="#54bdd6" /></section>
      <section className="settings-card"><h2>{t("Physical memory")}</h2><div className="metrics-value">{ram == null ? "—" : (ram / 1024 ** 3).toFixed(2)}<small>GiB {latest?.memoryTotalBytes ? `/ ${(latest.memoryTotalBytes / 1024 ** 3).toFixed(1)}` : ""}</small></div><p>{t(!settings?.ram ? "RAM sampling disabled" : "Memory in use")}</p><MetricChart history={history} field="memoryUsedBytes" max={memoryCapacity} color="#5485df" /></section>
      {([
        ["network", "Network traffic", "networkReceiveBytesPerSecond", "networkSendBytesPerSecond", "Receive", "Send", "Physical adapters"],
        ["disk", "Disk activity", "diskReadBytesPerSecond", "diskWriteBytesPerSecond", "Read", "Write", "Physical disks"],
      ] as const).map(([key, label, down, up, downLabel, upLabel, source]) => {
        const enabled = settings?.enabled && settings[key];
        const maximum = Math.max(1024, ...history.slice(-300).flatMap((sample) => [sample[down] ?? 0, sample[up] ?? 0]));
        return <section className="settings-card" key={key}><h2>{t(label)}</h2>
          <div className="metrics-duplex"><div><small>{t(downLabel)}</small><strong>{rate(enabled ? latest?.[down] : null)}</strong></div><div><small>{t(upLabel)}</small><strong>{rate(enabled ? latest?.[up] : null)}</strong></div></div>
          <p>{t(!settings?.[key] ? "Sampling disabled" : enabled && latest?.[down] == null ? "Warming up…" : source)} · {t("Solid / dashed")}</p>
          <MetricChart history={history} field={down} second={up} max={maximum} color="#779ab9" label={label} />
        </section>;
      })}
      <section className="settings-card"><h2>{t("Audio output level")}</h2><div className="metrics-value">{settings?.enabled && settings.audio && latest?.audioPeakPercent != null ? latest.audioPeakPercent.toFixed(1) : "—"}<small>%</small></div><p>{t(!settings?.audio ? "Sampling disabled" : "Default output · peak amplitude")}</p><MetricChart history={history} field="audioPeakPercent" max={100} color="#a09fc0" label="Audio output level" /></section>
      <section className="settings-card metrics-media"><h2>{t("Now playing")}</h2>
        {settings?.enabled && settings.media && latest?.media ? <><strong className="media-title">{latest.media.title || t("Untitled media")}</strong><p>{latest.media.artist || "—"}</p><span className="media-state">{t(latest.media.playbackStatus)}</span><small className="media-app">{latest.media.application}</small></> : <p>{t(!settings?.media ? "Sampling disabled" : !active ? "Paused" : latest?.errors.some((message) => message.startsWith("Media:")) ? "Unavailable" : latest ? "No current media session" : "Warming up…")}</p>}
        <p className="settings-footnote">{t("Media details are available only for apps that share them with Windows.")}</p>
      </section>
    </div>
    <div className="metrics-updated">{t("Last updated")}{" "}{latest ? new Date(latest.capturedAtMs).toLocaleTimeString(locale) : "—"} {" "}{t("· History clears on exit")}</div>
    {latest?.errors.map((message) => <p className="settings-error" role="alert" key={message}>{message}</p>)}
    <p role="status">{t(exportStatus, { count: exportCount })}</p>
  </div>;
}
