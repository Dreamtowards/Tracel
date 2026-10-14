import { useI18n, type Locale } from "@tracel/timeline";
import { Button } from "./components/ui/Button";
import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getSystemHistory, nativeClient, type CollectionStatus, type SystemObservation } from "./native";

function MetricChart({ history, field, max, color }: { history: SystemObservation[]; field: "cpuPercent" | "memoryUsedBytes"; max: number; color: string }) {
  const { t } = useI18n();
  const points = history.slice(-300);
  const first = points[0]?.capturedAtMs ?? 0;
  const end = Math.max(first + 2000, points.at(-1)?.capturedAtMs ?? first);
  let path = ""; let previous = 0; let connected = false;
  for (const point of points) {
    const value = point[field];
    if (value === null) { connected = false; continue; }
    const x = (point.capturedAtMs - first) / (end - first) * 1000;
    const y = 110 - Math.max(0, Math.min(1, value / Math.max(1, max))) * 100;
    path += `${connected && point.capturedAtMs - previous <= 6000 ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
    connected = true; previous = point.capturedAtMs;
  }
  return <svg viewBox="0 0 1000 120" preserveAspectRatio="none" role="img" aria-label={t("{metric} recent measured history", { metric: field === "cpuPercent" ? "CPU" : "RAM" })}><path d="M0 110H1000M0 60H1000M0 10H1000" stroke="#293034" fill="none" /><path d={path} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" /></svg>;
}

export default function SystemMetrics({ status, history, error, onSettings }: { status: CollectionStatus | null; history: SystemObservation[]; error: string; onSettings: () => void }) {
  const { t, locale } = useI18n();
  const [exportCount, setExportCount] = useState(0);
  const [exporting, setExporting] = useState(false); const [exportStatus, setExportStatus] = useState("");
  const settings = status?.settings;
  const active = !!(status?.supported && settings?.enabled && (settings.cpu || settings.ram));
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
      await writeTextFile(path, JSON.stringify({ source: "Tracel native system metrics", timestampUnit: "UTC Unix milliseconds", cpuUnit: "percent", memoryUnit: "bytes", nominalPeriodMs: 2000, samples }, null, 2));
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
    </div>
    <div className="metrics-updated">{t("Last updated")}{" "}{latest ? new Date(latest.capturedAtMs).toLocaleTimeString(locale) : "—"} {" "}{t("· History clears on exit")}</div>
    {latest?.errors.map((message) => <p className="settings-error" role="alert" key={message}>{message}</p>)}
    <p role="status">{t(exportStatus, { count: exportCount })}</p>
  </div>;
}
