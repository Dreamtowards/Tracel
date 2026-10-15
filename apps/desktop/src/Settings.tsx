import { useI18n, type Locale } from "@tracel/timeline";
import { Button } from "./components/ui/Button";
import { SettingsGroup, SettingToggle as Toggle } from "./components/SettingsGroup";
import { Select } from "./components/ui/Select";
import { accentPresets, defaultAccent } from "./theme";
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { InfoTip } from "./components/ui/InfoTip";
import { inspectForeground, openDatabaseFolder, nativeClient, type CollectionSettings, type CollectionStatus, type ForegroundInfo } from "./native";
import { zoomLevels } from "./useAppearance";

export default function Settings({ status, busy, error, onSettings, zoom, onZoom, accent, onAccent, language, onLanguage }: {
  status: CollectionStatus | null; busy: boolean; error: string;
  onSettings: (settings: CollectionSettings) => Promise<void>;
  language: Locale; onLanguage: (language: Locale) => void;
  zoom: number; onZoom: (zoom: number) => void; accent: string; onAccent: (accent: string) => void;
}) {
  const { t, locale } = useI18n();
  const settings: CollectionSettings = status?.settings ?? { enabled: false, cpu: true, ram: true, network: false, disk: false, audio: false, media: false };
  const unavailable = !nativeClient || !status?.supported;
  const [debug, setDebug] = useState<ForegroundInfo | null>(null);
  const [debugging, setDebugging] = useState(false);
  const [toolMessage, setToolMessage] = useState("");
  const [toolError, setToolError] = useState("");
  const [folderError, setFolderError] = useState("");
  const [openingFolder, setOpeningFolder] = useState(false);
  const openFolder = async () => {
    setFolderError(""); setOpeningFolder(true);
    try { await openDatabaseFolder(); }
    catch (reason) { setFolderError(String(reason)); }
    finally { setOpeningFolder(false); }
  };
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
    {status?.storageError && <p role="alert" className="settings-error">{t("Storage unavailable:")} {status.storageError}</p>}
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
      {([['network', 'Network traffic', 'Physical adapters · receive and send'], ['disk', 'Disk activity', 'Physical disks · read and write'], ['audioInput', 'Audio input level', 'Default microphone peak only · no audio recording'], ['audio', 'Audio output level', 'Output peak only · no audio recording'], ['media', 'Now playing', 'Title and artist from supported media apps']] as const).map(([key, label, description]) => <Toggle key={key} label={label} description={description} checked={settings[key] ?? false} disabled={unavailable} pending={busy} onChange={(value) => { void onSettings({ ...settings, [key]: value }); }} />)}
      {([['gpu', 'GPU usage and memory', 'Per GPU · engines, dedicated and shared memory'], ['battery', 'Battery and power', 'Battery percentage · plugged in and charging'], ['cpuFrequency', 'CPU frequency', 'Windows-reported frequency · separate GHz track']] as const).map(([key,label,description]) => <Toggle key={key} label={label} description={description} checked={settings[key] ?? false} disabled={unavailable} pending={busy} onChange={(value) => { void onSettings({ ...settings, [key]: value }); }} />)}
      <p className="settings-footnote">{t("Measurements are saved locally in SQLite and shown on the Timeline.")}</p>
    </SettingsGroup>
    <SettingsGroup title={t("Application activity")}>
      {([
        ['foreground','Foreground apps and window titles','Window titles only · no URLs or file contents'],
        ['background','Apps','Apps with desktop windows, including minimized windows'],
        ['idle','Idle / AFK detection','Idle after 5 minutes without keyboard or mouse input'],
      ] as const).map(([key,label,description]) => <Toggle key={key} label={label} description={description} checked={settings[key] ?? false} disabled={unavailable} pending={busy} onChange={(value) => { void onSettings({...settings,[key]:value}); }} />)}
      <p className="settings-footnote">{t("Uses the collection master switch. New activity is saved locally; earlier activity cannot be recovered.")}</p>
    </SettingsGroup>
    <SettingsGroup title={t("Storage")}>
      <div className="settings-action"><div><strong>SQLite</strong><small>{t("Saved observations")}: {status?.persistedCount?.toLocaleString(locale) ?? "—"}</small></div>
        <div className="storage-size"><span>{status?.databaseSizeBytes == null ? "—" : `${(status.databaseSizeBytes / 1000000).toLocaleString(locale,{minimumFractionDigits:2,maximumFractionDigits:2})} MB`}</span><InfoTip label={t("About storage size")}>{t("Includes the database, WAL and shared-memory files.")}</InfoTip></div>
        <Button disabled={unavailable || !status?.databasePath || openingFolder} onClick={() => { void openFolder(); }}><FolderOpen size={14}/>{t("Open folder")}</Button>
      </div>
      {folderError && <p role="alert" className="settings-error">{t("Could not open database folder.")} {folderError}</p>}
      {status?.databasePath && <p className="settings-storage-path">{status.databasePath}</p>}
      <p className="settings-footnote">{t("History survives restart. Close Tracel before copying the database for backup.")}</p>
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
