import { useId, useState } from "react";
import { Switch } from "./components/ui/Switch";
import { inspectForeground, nativeClient, type CollectionSettings, type CollectionStatus, type ForegroundInfo } from "./native";
import { zoomLevels } from "./useAppearance";

function Toggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return <div className="settings-toggle"><label htmlFor={id}><strong>{label}</strong>{description && <small id={`${id}-description`}>{description}</small>}</label><Switch id={id} aria-label={label} aria-describedby={description ? `${id}-description` : undefined} checked={checked} disabled={disabled} onCheckedChange={onChange} /></div>;
}

export default function Settings({ status, busy, error, onSettings, onAwake, zoom, onZoom }: {
  status: CollectionStatus | null; busy: boolean; error: string;
  onSettings: (settings: CollectionSettings) => Promise<void>; onAwake: (enabled: boolean) => Promise<void>;
  zoom: number; onZoom: (zoom: number) => void;
}) {
  const settings = status?.settings ?? { enabled: false, cpu: true, ram: true };
  const unavailable = !nativeClient || !status?.supported;
  const [debug, setDebug] = useState<ForegroundInfo | null>(null);
  const [debugging, setDebugging] = useState(false);
  const [toolMessage, setToolMessage] = useState("");
  const [toolError, setToolError] = useState("");
  const inspect = async () => {
    setDebugging(true); setToolError(""); setToolMessage("Switch to the window you want to inspect. Capturing in 3 seconds…");
    try { setDebug(await inspectForeground()); setToolMessage("Snapshot captured."); }
    catch { setToolError("Could not inspect the foreground window. Try an ordinary desktop window."); }
    finally { setDebugging(false); }
  };
  return <div className="desktop-page settings-page">
    <header className="desktop-page-heading"><h1>Settings</h1></header>
    {unavailable && <p className="settings-banner">{nativeClient && !status ? "Connecting to the native collector…" : "Preview: native features require the Windows client."}</p>}
    {error && <p role="alert" className="settings-error">{error}</p>}
    {status?.startupWarning && <p role="alert" className="settings-error">{status.startupWarning}</p>}
    <section className="settings-card"><h2>Appearance</h2>
      <div className="settings-action settings-zoom"><label htmlFor="interface-zoom"><strong>Interface zoom</strong><small>Ctrl + / - to adjust; Ctrl 0 to reset</small></label>
        <select id="interface-zoom" value={zoom} onChange={(event) => onZoom(Number(event.target.value))}>{zoomLevels.map((level) => <option value={level} key={level}>{level}%{level === 110 ? " (default)" : ""}</option>)}</select>
      </div>
    </section>
    <section className="settings-card"><h2>Collection</h2>
      <Toggle label="Enable collection" description="Every 2 seconds. Disabled sources are not queried." checked={settings.enabled} disabled={unavailable || busy} onChange={(enabled) => { void onSettings({ ...settings, enabled }); }} />
      <Toggle label="CPU usage" description="" checked={settings.cpu} disabled={unavailable || busy} onChange={(cpu) => { void onSettings({ ...settings, cpu }); }} />
      <Toggle label="RAM usage" description="" checked={settings.ram} disabled={unavailable || busy} onChange={(ram) => { void onSettings({ ...settings, ram }); }} />
      <Toggle label="GPU usage" description="Coming later" checked={false} disabled onChange={() => {}} />
      <p className="settings-footnote">Measurements stay in memory until exit. Timeline uses demo data.</p>
    </section>
    <section className="settings-card"><h2>Power</h2>
      <Toggle label="Prevent automatic sleep" description="While Tracel runs. Normal display timeout still works." checked={status?.keepAwakeRequested ?? false} disabled={unavailable || busy} onChange={(enabled) => { void onAwake(enabled); }} />
      <div className="settings-action"><div><strong>Display timeout</strong><small>Use Windows display timeout. Manual screen-off is unavailable.</small></div><button className="tx-button" disabled>Turn display off</button></div>
      {status?.keepAwakeRequested !== status?.keepAwakeActive && <p role="status">Applying power request…</p>}
      {status?.powerError && <p role="alert" className="settings-error">Power request failed: {status.powerError}</p>}
    </section>
    <section className="settings-card"><h2>Diagnostics</h2><p>Capture a window title and executable. Switch windows within 3 seconds.</p>
      <button className="tx-button" disabled={unavailable || debugging} onClick={() => { void inspect(); }}>{debugging ? "Switch windows — capturing…" : "Inspect foreground in 3 seconds"}</button>
      {toolMessage && <p role="status" className="settings-tool-status">{toolMessage}</p>}
      {toolError && <p role="alert" className="settings-error">{toolError}</p>}
      {debug && <dl className="settings-debug">
        <div><dt>Captured</dt><dd>{new Date(debug.capturedAtMs).toLocaleString()}</dd></div>
        <div><dt>Window title</dt><dd>{debug.title || "Untitled window"}</dd></div>
        <div><dt>Executable</dt><dd>{debug.executable ?? "Unavailable / protected process"}</dd></div>
        <div><dt>Process / window</dt><dd>{debug.processId} / {debug.windowId}</dd></div>
        <div><dt>URL</dt><dd>{debug.url ?? "Not available yet"}</dd></div>
        {debug.notes.map((note) => <div key={note}><dt>Note</dt><dd>{note}</dd></div>)}
      </dl>}
    </section>
  </div>;
}
