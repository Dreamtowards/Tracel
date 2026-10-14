import { useState } from "react";
import { inspectForeground, nativeClient, type CollectionSettings, type CollectionStatus, type ForegroundInfo } from "./native";

function Toggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="settings-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="settings-switch" aria-hidden="true" /></label>;
}

export default function Settings({ status, busy, error, onSettings, onAwake }: {
  status: CollectionStatus | null; busy: boolean; error: string;
  onSettings: (settings: CollectionSettings) => Promise<void>; onAwake: (enabled: boolean) => Promise<void>;
}) {
  const settings = status?.settings ?? { enabled: false, cpu: true, ram: true };
  const unavailable = !nativeClient || !status?.supported;
  const [debug, setDebug] = useState<ForegroundInfo | null>(null);
  const [debugging, setDebugging] = useState(false);
  const [toolMessage, setToolMessage] = useState("");
  const [toolError, setToolError] = useState("");
  const inspect = async () => {
    setDebugging(true); setToolError(""); setToolMessage("Switch to the window you want to inspect. Capturing in 3 seconds…");
    try { setDebug(await inspectForeground()); setToolMessage("Foreground snapshot captured. This is a one-time read."); }
    catch { setToolError("Could not inspect the foreground window. Try an ordinary desktop window."); }
    finally { setDebugging(false); }
  };
  return <div className="desktop-page settings-page">
    <header className="desktop-page-heading"><div className="tx-eyebrow">YOUR DEVICE / YOUR CHOICE</div><h1>Settings</h1><p>Choose what to collect. Disabled metrics are never queried.</p></header>
    {unavailable && <p className="settings-banner">{nativeClient && !status ? "Connecting to the native collector…" : "Native collection and power tools are available in the Windows client. Browser preview does not collect device data."}</p>}
    {error && <p role="alert" className="settings-error">{error}</p>}
    {status?.startupWarning && <p role="alert" className="settings-error">{status.startupWarning}</p>}
    <section className="settings-card"><h2>Collection</h2><p>System-wide measurements every 2 seconds. Preferences are saved on this device; the latest 1,800 observations stay in memory (about 1 hour of continuous collection).</p>
      <Toggle label="Enable collection" description="Master switch. Off means the sampler waits without querying metrics." checked={settings.enabled} disabled={unavailable || busy} onChange={(enabled) => { void onSettings({ ...settings, enabled }); }} />
      <Toggle label="CPU usage" description="Reads system CPU time counters. First sample after enabling warms up the baseline." checked={settings.cpu} disabled={unavailable || busy} onChange={(cpu) => { void onSettings({ ...settings, cpu }); }} />
      <Toggle label="RAM usage" description="Reads physical memory used and total. No process list or per-app scan." checked={settings.ram} disabled={unavailable || busy} onChange={(ram) => { void onSettings({ ...settings, ram }); }} />
      <Toggle label="GPU usage" description="Not supported yet. No GPU queries run in this release." checked={false} disabled onChange={() => {}} />
      <p className="settings-footnote">Individual choices are retained while the master switch is off. Timeline still shows the separate demo capture; open System metrics for live measurements.</p>
    </section>
    <section className="settings-card"><h2>Power tools</h2><p>Uses Windows power requests, without changing your system power plan.</p>
      <Toggle label="Prevent automatic sleep" description="Keeps the computer working while this client runs. The display may turn off normally. Resets off on restart; manual sleep still works." checked={status?.keepAwakeRequested ?? false} disabled={unavailable || busy} onChange={(enabled) => { void onAwake(enabled); }} />
      <div className="settings-action"><div><strong>Turn display off now — unavailable</strong><small>Disabled after a wake-up reliability issue. No display-off commands are sent. Use the system display timeout while Prevent automatic sleep is enabled.</small></div><button className="tx-button" disabled>Turn display off</button></div>
      {status?.keepAwakeRequested !== status?.keepAwakeActive && <p role="status">Applying power request…</p>}
      {status?.powerError && <p role="alert" className="settings-error">Power request failed: {status.powerError}</p>}
    </section>
    <section className="settings-card"><h2>Collector diagnostics</h2><p>Inspect one foreground window. Click, then switch to a browser or editor within 3 seconds. Results stay in this page and are not stored in history.</p>
      <button className="tx-button" disabled={unavailable || debugging} onClick={() => { void inspect(); }}>{debugging ? "Switch windows — capturing…" : "Inspect foreground in 3 seconds"}</button>
      <p role="status" className="settings-tool-status">{toolMessage}</p>
      {toolError && <p role="alert" className="settings-error">{toolError}</p>}
      {debug && <dl className="settings-debug">
        <div><dt>Captured</dt><dd>{new Date(debug.capturedAtMs).toLocaleString()}</dd></div>
        <div><dt>Window title</dt><dd>{debug.title || "Untitled window"}</dd></div>
        <div><dt>Executable</dt><dd>{debug.executable ?? "Unavailable / protected process"}</dd></div>
        <div><dt>Process / window</dt><dd>{debug.processId} / {debug.windowId} · snapshot identifiers, not durable identities</dd></div>
        <div><dt>URL</dt><dd>{debug.url ?? "Not collected — browser UI Automation adapter is not implemented yet"}</dd></div>
        {debug.notes.map((note) => <div key={note}><dt>Note</dt><dd>{note}</dd></div>)}
      </dl>}
    </section>
  </div>;
}
