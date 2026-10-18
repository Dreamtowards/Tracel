import { usePlatform } from "./platform";
import { AppearanceSettings } from "./AppearanceSettings";
import { useI18n, type Locale, type CategoryConfig } from "@tracel/timeline";
import { Button } from "./components/ui/Button";
import { SettingsGroup } from "./components/SettingsGroup";
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { InfoTip } from "./components/ui/InfoTip";
import type { CollectionStatus, ForegroundInfo } from "./platformTypes";

export default function Settings({ categories, status, error, onTimeline, zoom, onZoom, accent, onAccent, language, onLanguage }: {
  categories: { config: CategoryConfig; path: string; error: string };
  status: CollectionStatus | null; error: string;
  onTimeline: () => void;
  language: Locale; onLanguage: (language: Locale) => void;
  zoom: number; onZoom: (zoom: number) => void; accent: string; onAccent: (accent: string) => void;
}) {
  const { openCategoryFolder, inspectForeground, openDatabaseFolder, nativeClient } = usePlatform();
  const { t, locale } = useI18n();
  const unavailable = !nativeClient || !status?.supported;
  const [debug, setDebug] = useState<ForegroundInfo | null>(null);
  const [debugging, setDebugging] = useState(false);
  const [toolMessage, setToolMessage] = useState("");
  const [toolError, setToolError] = useState("");
  const [folderError, setFolderError] = useState("");
  const [categoryFolderError, setCategoryFolderError] = useState("");
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
    <AppearanceSettings language={language} onLanguage={onLanguage} zoom={zoom} onZoom={onZoom} accent={accent} onAccent={onAccent} />
    <SettingsGroup title={t("Categories")}>
      <div className="settings-action"><div><strong>categories.json</strong><small>{t("Edit this file, then return to Tracel to reload categories.")}</small><small style={{ overflowWrap: "anywhere" }}>{categories.path || t("Browser preview uses the default categories.")}</small></div></div>
      {categories.error && <p role="alert" className="settings-error">{categories.error}</p>}
      <div className="settings-card-actions"><Button disabled={!nativeClient} onClick={() => { setCategoryFolderError(""); void openCategoryFolder().catch(reason => setCategoryFolderError(String(reason))); }}><FolderOpen size={14} />{t("Open configuration folder")}</Button></div>
      {categoryFolderError && <p role="alert" className="settings-error">{categoryFolderError}</p>}
    </SettingsGroup>
    <SettingsGroup title={t("Collection")}>
      <div className="settings-card-body"><p>{t("Right-click track headers to configure collection")}</p>
      <Button onClick={onTimeline}>{t("Open Timeline")}</Button></div>
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
