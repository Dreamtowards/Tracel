import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { getSystemHistory, nativeClient, type CollectionStatus, type SystemObservation } from "./native";

function MetricChart({ history, field, max, color }: { history: SystemObservation[]; field: "cpuPercent" | "memoryUsedBytes"; max: number; color: string }) {
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
  return <svg viewBox="0 0 1000 120" preserveAspectRatio="none" role="img" aria-label={`${field === "cpuPercent" ? "CPU" : "RAM"} recent measured history`}><path d="M0 110H1000M0 60H1000M0 10H1000" stroke="#293034" fill="none" /><path d={path} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" /></svg>;
}

export default function SystemMetrics({ status, history, error, onSettings }: { status: CollectionStatus | null; history: SystemObservation[]; error: string; onSettings: () => void }) {
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
      const path = await save({ title: "Export recorded system metrics", defaultPath: "tracel-system-metrics.json", filters: [{ name: "JSON", extensions: ["json"] }] });
      if (!path) { setExportStatus("Export cancelled."); return; }
      await writeTextFile(path, JSON.stringify({ source: "Tracel native system metrics", timestampUnit: "UTC Unix milliseconds", cpuUnit: "percent", memoryUnit: "bytes", nominalPeriodMs: 2000, samples }, null, 2));
      setExportStatus(`Saved ${samples.length} measured observations.`);
    } catch { setExportStatus("Could not save metrics. Please try again."); }
    finally { setExporting(false); }
  };
  return <div className="desktop-page metrics-page">
    <header className="desktop-page-heading"><div className="tx-eyebrow">SYSTEM / MEASURED LOCALLY</div><h1>System metrics</h1><p>Real system-wide CPU and physical memory readings. No simulated values.</p><div className="metrics-actions"><button className="tx-button" onClick={onSettings}>Collection settings</button><button className="tx-button" onClick={() => { void exportHistory(); }} disabled={!nativeClient || exporting || !status?.sampleCount}>{exporting ? "Saving…" : "Export measurements"}</button></div></header>
    <div className="metrics-state"><i className={active ? "active" : ""} />{!nativeClient ? "Windows client required" : !status ? "Connecting…" : active ? "Collecting every 2 seconds" : "Collection paused"}<span>{status?.sampleCount ?? 0} observations · latest 1,800 retained in memory</span></div>
    {error && <p role="alert" className="settings-error">{error}</p>}
    {!active && <p className="settings-banner">Enable collection in Settings to start. Previously recorded history remains available until you close the client.</p>}
    <div className="metrics-grid">
      <section className="settings-card"><h2>CPU usage</h2><div className="metrics-value">{cpu == null ? "—" : cpu.toFixed(1)}<small>%</small></div><p>{!settings?.cpu ? "CPU sampling disabled" : active && cpu == null ? "Waiting for two valid CPU counter reads…" : "System CPU utilization · kernel + user minus idle"}</p><MetricChart history={history} field="cpuPercent" max={100} color="#54bdd6" /></section>
      <section className="settings-card"><h2>Physical memory</h2><div className="metrics-value">{ram == null ? "—" : (ram / 1024 ** 3).toFixed(2)}<small>GiB {latest?.memoryTotalBytes ? `/ ${(latest.memoryTotalBytes / 1024 ** 3).toFixed(1)}` : ""}</small></div><p>{!settings?.ram ? "RAM sampling disabled" : "Physical memory used · total minus available"}</p><MetricChart history={history} field="memoryUsedBytes" max={memoryCapacity} color="#5485df" /></section>
    </div>
    <section className="settings-card"><h2>Capture status</h2><dl className="settings-debug"><div><dt>Last observation</dt><dd>{latest ? new Date(latest.capturedAtMs).toLocaleString() : "No measurements yet"}</dd></div><div><dt>Active sources</dt><dd>{settings?.enabled ? [settings.cpu && "CPU", settings.ram && "RAM"].filter(Boolean).join(" + ") || "None selected" : "Master switch off"}</dd></div><div><dt>GPU / network / disk / audio</dt><dd>Not sampled in this release</dd></div></dl>{latest?.errors.map((message) => <p className="settings-error" role="alert" key={message}>{message}</p>)}<p>Gaps and warm-up readings stay missing. Charts show the latest 300 observations and break across pauses. The Timeline tab remains the separate October demo.</p></section>
    <p role="status">{exportStatus}</p>
  </div>;
}
