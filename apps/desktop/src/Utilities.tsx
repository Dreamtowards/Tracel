import { ScreenTimeout } from "./ScreenTimeout";
import { useRef, useState } from "react";
import { useI18n } from "@tracel/timeline";
import { open } from "@tauri-apps/plugin-dialog";
import { FileSearch, RefreshCw } from "lucide-react";
import { Button } from "./components/ui/Button";
import { SettingsGroup, SettingToggle } from "./components/SettingsGroup";
import { inspectFileUsers, nativeClient, type CollectionStatus, type FileUsage } from "./native";

export default function Utilities({ status, busy, error, onAwake }: {
  status: CollectionStatus | null; busy: boolean; error: string; onAwake: (enabled: boolean) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const unavailable = !nativeClient || !status?.supported;
  const [path, setPath] = useState("");
  const [result, setResult] = useState<FileUsage | null>(null);
  const [checking, setChecking] = useState(false);
  const [fileError, setFileError] = useState("");
  const request = useRef(false);
  const check = async (choose: boolean) => {
    if (request.current) return;
    request.current = true; setChecking(true); setFileError("");
    try {
      const selected = choose ? await open({ title: t("Choose a file to inspect"), directory: false, multiple: false }) : path;
      if (typeof selected !== "string" || !selected) return;
      const filename = selected.startsWith('"') && selected.endsWith('"') ? selected.slice(1, -1) : selected;
      setPath(filename); setResult(null);
      setResult(await inspectFileUsers(filename));
    } catch (reason) { setResult(null); setFileError(typeof reason === "string" ? reason : String(reason)); }
    finally { request.current = false; setChecking(false); }
  };
  return <div className="desktop-page utilities-page">
    <header className="desktop-page-heading"><h1>{t("Utilities")}</h1></header>
    {!nativeClient && <p className="settings-banner">{t("Preview: native features require the Windows client.")}</p>}
    {error && <p className="settings-error" role="alert">{t(error)}</p>}
    <SettingsGroup title={t("Power")}>
      <SettingToggle label="Prevent automatic sleep" description="While Tracel runs. Normal display timeout still works." checked={status?.keepAwakeRequested ?? false} disabled={unavailable} pending={busy} onChange={(enabled) => { void onAwake(enabled); }} />
      <ScreenTimeout unavailable={unavailable} />
      {status?.keepAwakeRequested !== status?.keepAwakeActive && <p role="status">{t("Applying power request…")}</p>}
      {status?.powerError && <p role="alert" className="settings-error">{t("Power request failed:")}{" "}{status.powerError}</p>}
    </SettingsGroup>
    <SettingsGroup title={t("File usage")}>
      <div className="settings-action"><div><strong>{t("Find apps using a file")}</strong><small>{t("A current snapshot from Windows. No programs are closed.")}</small></div>
        <Button variant="secondary" className="tx-button" disabled={!nativeClient || checking} onClick={() => { void check(true); }}><FileSearch size={14} />{t("Choose file")}</Button>
        <Button className="tx-icon-button" title={t("Refresh file usage")} aria-label={t("Refresh file usage")} disabled={!nativeClient || !path || checking} onClick={() => { void check(false); }}><RefreshCw size={14} /></Button>
      </div>
      <form className="file-path-form" onSubmit={(event) => { event.preventDefault(); if (nativeClient && path) void check(false); }}>
        <input aria-label={t("File path")} placeholder={t("Or paste a file path and press Enter")} value={path} disabled={!nativeClient || checking}
          onChange={(event) => { setPath(event.target.value); setResult(null); setFileError(""); }} />
      </form>
      {checking && <p role="status">{t("Checking file usage…")}</p>}
      {fileError && <p className="settings-error" role="alert">{t("Could not inspect this file.")} <span>{fileError}</span></p>}
      {result && <>
        <dl className="settings-debug">
          <div><dt>{t("Checked")}</dt><dd>{new Date(result.checkedAtMs).toLocaleString(locale)}</dd></div>
          <div><dt>{t("Last modified")}</dt><dd>{result.modifiedAtMs === null ? t("Unavailable") : new Date(result.modifiedAtMs).toLocaleString(locale)}</dd></div>
        </dl>
        {result.processes.length ? <ul className="file-process-list">{result.processes.map((process) => <li key={`${process.processId}-${process.startedAtTicks}`}>
          <div><strong>{process.name || t("Unnamed process")}</strong><span>PID {process.processId}</span></div>
          <small>{process.executable ?? t("Process path unavailable")}</small>
          {process.service && <small>{t("Service")}: {process.service}</small>}
        </li>)}</ul> : <p role="status">{t("Windows reported no apps using this file. Some file handles may not be detected.")}</p>}
        <p className="settings-footnote">{t("Results may be incomplete and can change. A listed app is not necessarily blocking deletion.")}</p>
      </>}
      <p className="settings-footnote">{t("Past modifying programs are unavailable without prior auditing. The modified time does not identify an app.")}</p>
    </SettingsGroup>
  </div>;
}
