import { useI18n, type Locale } from "@tracel/timeline";
import { Button } from "./components/ui/Button";
import { Card } from "./components/ui/Card";
import { Select } from "./components/ui/Select";
import { accentPresets, defaultAccent } from "./theme";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { Switch } from "./components/ui/Switch";
import { inspectForeground, nativeClient, type CollectionSettings, type CollectionStatus, type ForegroundInfo } from "./native";
import { zoomLevels } from "./useAppearance";

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const id = useId();
  return <section className="settings-group" aria-labelledby={id}><h2 id={id}>{t(title)}</h2><Card className="settings-card">{children}</Card></section>;
}

function Toggle({ label, description, checked, disabled, pending, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; pending?: boolean; onChange: (checked: boolean) => void }) {
  const { t } = useI18n();
  const id = useId();
  return <div className="settings-toggle"><label htmlFor={id}><strong>{t(label)}</strong>{description && <small id={`${id}-description`}>{t(description)}</small>}</label><Switch id={id} aria-label={t(label)} aria-describedby={description ? `${id}-description` : undefined} checked={checked} disabled={disabled} aria-disabled={disabled || pending} onCheckedChange={(value) => { if (!pending) onChange(value); }} /></div>;
}

export default function Settings({ status, busy, error, onSettings, onAwake, zoom, onZoom, accent, onAccent, language, onLanguage }: {
  status: CollectionStatus | null; busy: boolean; error: string;
  onSettings: (settings: CollectionSettings) => Promise<void>; onAwake: (enabled: boolean) => Promise<void>;
  language: Locale; onLanguage: (language: Locale) => void;
  zoom: number; onZoom: (zoom: number) => void; accent: string; onAccent: (accent: string) => void;
}) {
  const { t, locale } = useI18n();
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
    <header className="desktop-page-heading"><h1>{t("Settings")}</h1></header>
    {unavailable && <p className="settings-banner">{t(nativeClient && !status ? "Connecting to the native collector…" : "Preview: native features require the Windows client.")}</p>}
    {error && <p role="alert" className="settings-error">{t(error)}</p>}
    {status?.startupWarning && <p role="alert" className="settings-error">{status.startupWarning}</p>}
    <SettingsGroup title={t("Appearance")}>
      <div className="settings-action"><label htmlFor="interface-language"><strong>{t("Language")}</strong></label><Select id="interface-language" label={t("Language")} value={language} onValueChange={(value) => onLanguage(value as Locale)} options={[{ value: "en", label: "English" }, { value: "zh-CN", label: "中文" }]} /></div>
      <div className="settings-action settings-zoom"><label htmlFor="interface-zoom"><strong>{t("Interface zoom")}</strong><small>{t("Ctrl + / - to adjust; Ctrl 0 to reset")}</small></label>
        <Select id="interface-zoom" label={t("Interface zoom")} value={String(zoom)} onValueChange={(value) => onZoom(Number(value))} options={zoomLevels.map((level) => ({ value: String(level), label: `${level}%` }))} />
      </div>
      <div className="settings-action settings-accent"><div><strong>{t("Accent color")}</strong></div>
        <div className="accent-options">{accentPresets.map(({ name, color }) => <button key={name} className="accent-swatch" style={{ background: color }} aria-label={t("{name} accent", { name: t(name) })} aria-pressed={accent === color} title={t(name)} onClick={() => onAccent(color)} />)}
          <label className="accent-custom" title={t("Custom accent color")}><span>{t("Custom")}</span><input type="color" aria-label={t("Custom accent color")} value={accent} onChange={(event) => onAccent(event.target.value)} /></label>
          {accent !== defaultAccent && <Button className="tx-text-button" onClick={() => onAccent(defaultAccent)}>{t("Reset")}</Button>}
        </div>
      </div>
    </SettingsGroup>
    <SettingsGroup title={t("Collection")}>
      <Toggle label="Enable collection" description="Every 2 seconds. Disabled sources are not queried." checked={settings.enabled} disabled={unavailable} pending={busy} onChange={(enabled) => { void onSettings({ ...settings, enabled }); }} />
      <Toggle label="CPU usage" description="" checked={settings.cpu} disabled={unavailable} pending={busy} onChange={(cpu) => { void onSettings({ ...settings, cpu }); }} />
      <Toggle label="RAM usage" description="" checked={settings.ram} disabled={unavailable} pending={busy} onChange={(ram) => { void onSettings({ ...settings, ram }); }} />
      <Toggle label="GPU usage" description="Coming later" checked={false} disabled onChange={() => {}} />
      <p className="settings-footnote">{t("Measurements stay in memory until exit. Timeline uses demo data.")}</p>
    </SettingsGroup>
    <SettingsGroup title={t("Power")}>
      <Toggle label="Prevent automatic sleep" description="While Tracel runs. Normal display timeout still works." checked={status?.keepAwakeRequested ?? false} disabled={unavailable} pending={busy} onChange={(enabled) => { void onAwake(enabled); }} />
      <div className="settings-action"><div><strong>{t("Display timeout")}</strong><small>{t("Use Windows display timeout. Manual screen-off is unavailable.")}</small></div><Button className="tx-button" disabled>{t("Turn display off")}</Button></div>
      {status?.keepAwakeRequested !== status?.keepAwakeActive && <p role="status">{t("Applying power request…")}</p>}
      {status?.powerError && <p role="alert" className="settings-error">{t("Power request failed:")}{" "}{status.powerError}</p>}
    </SettingsGroup>
    <SettingsGroup title={t("Diagnostics")}><p>{t("Capture a window title and executable. Switch windows within 3 seconds.")}</p>
      <Button className="tx-button" disabled={unavailable || debugging} onClick={() => { void inspect(); }}>{t(debugging ? "Switch windows — capturing…" : "Inspect foreground in 3 seconds")}</Button>
      {toolMessage && <p role="status" className="settings-tool-status">{t(toolMessage)}</p>}
      {toolError && <p role="alert" className="settings-error">{t(toolError)}</p>}
      {debug && <dl className="settings-debug">
        <div><dt>{t("Captured")}</dt><dd>{new Date(debug.capturedAtMs).toLocaleString(locale)}</dd></div>
        <div><dt>{t("Window title")}</dt><dd>{debug.title || t("Untitled window")}</dd></div>
        <div><dt>{t("Executable")}</dt><dd>{debug.executable ?? t("Unavailable / protected process")}</dd></div>
        <div><dt>{t("Process / window")}</dt><dd>{debug.processId} / {debug.windowId}</dd></div>
        <div><dt>{t("URL")}</dt><dd>{debug.url ?? t("Not available yet")}</dd></div>
        {debug.notes.map((note) => <div key={note}><dt>{t("Note")}</dt><dd>{note}</dd></div>)}
      </dl>}
    </SettingsGroup>
  </div>;
}
