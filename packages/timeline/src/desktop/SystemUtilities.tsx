import { usePlatform } from "./platform";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@tracel/timeline";
import { ExternalLink, RefreshCw, ScanLine } from "lucide-react";
import { Button } from "./components/ui/Button";
import { InfoTip } from "./components/ui/InfoTip";
import { SettingsGroup } from "./components/SettingsGroup";
import type { EnvironmentReport, UpdatePolicy } from "./platformTypes";

export function SystemUtilities() {
  const { inspectEnvironment, nativeClient, openSystemShortcut, updatePolicy } = usePlatform();
  const { t, locale } = useI18n();
  const [policy, setPolicy] = useState<UpdatePolicy | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [policyBusy, setPolicyBusy] = useState(false);
  const [report, setReport] = useState<EnvironmentReport | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState("");
  const [shortcutError, setShortcutError] = useState("");
  const policyRequest = useRef(false);
  const scanRequest = useRef(false);
  useEffect(() => {
    if (!nativeClient) return;
    let active = true;
    void updatePolicy("read").then((value) => { if (active) setPolicy(value); }, (error: unknown) => { if (active) setPolicyError(String(error)); });
    return () => { active = false; };
  }, []);
  const changePolicy = async (action: "read" | "disable" | "restore") => {
    if (policyRequest.current) return;
    policyRequest.current = true; setPolicyBusy(true); setPolicyError("");
    try { setPolicy(await updatePolicy(action)); }
    catch (error) {
      setPolicyError(String(error));
      // A timed-out write may have completed. Read the actual registry before another action.
      try { setPolicy(await updatePolicy("read")); } catch { setPolicy(null); }
    } finally { policyRequest.current = false; setPolicyBusy(false); }
  };
  const scan = async () => {
    if (scanRequest.current) return;
    scanRequest.current = true; setScanBusy(true); setScanError("");
    try { setReport(await inspectEnvironment()); } catch (error) { setScanError(String(error)); }
    finally { scanRequest.current = false; setScanBusy(false); }
  };
  const open = async (target: string) => {
    setShortcutError("");
    try { await openSystemShortcut(target); } catch (error) { setShortcutError(String(error)); }
  };
  const since = policy?.since ? new Date(policy.since) : null;
  const days = since && Number.isFinite(since.getTime()) ? Math.max(0, Math.floor((Date.now() - since.getTime()) / 86_400_000)) : null;
  return <>
    <SettingsGroup title={t("Windows Update")} help={<InfoTip label={t("About Windows Update")}>
      <p>{t("Uses the official automatic-update policy. Manual updates remain available. Requires administrator rights and a supported Windows edition.")}</p>
      <p>{t("Until restored, with no expiry. Disabling updates also stops automatic security updates. Windows or organization policies may override this setting.")}</p>
      <p>{t("Year-based expiry is not supported. Tracel does not change services, scheduled tasks or restart deadlines.")}</p>
    </InfoTip>}>
      <div className="settings-action system-tools-action"><div><strong>{t("Automatic updates")}</strong>
        <p>{policy ? t(policy.disabled ? "Disabled by policy" : "Not disabled by this policy") : t(!nativeClient ? "Requires the Windows client" : policyError ? "Unavailable" : "Reading policy…")}</p>
      </div>
        <Button variant="secondary" disabled={!policy?.supported || !policy.administrator || policy.disabled || policy.owned || policyBusy} onClick={() => { void changePolicy("disable"); }}>{t("Disable until restored")}</Button>
        <Button disabled={!policy?.owned || !policy.administrator || !policy.supported || policyBusy} onClick={() => { void changePolicy("restore"); }}>{t("Restore previous setting")}</Button>
        <Button className="tx-icon-button" aria-label={t("Refresh update policy")} title={t("Refresh update policy")} disabled={!nativeClient || policyBusy} onClick={() => { void changePolicy("read"); }}><RefreshCw size={14} /></Button>
      </div>
      <div className="utility-policy-details">
        {policy && <span>{policy.edition} · {t(policy.administrator ? "Administrator" : "Run Tracel as administrator to change this setting")}</span>}
        {days !== null && since && <span>{t("Disabled since")} {since.toLocaleDateString(locale)} · {days} {t("days")} ({(days / 365.2425).toFixed(2)} {t("years")})</span>}
        {policy?.disabled && !policy.owned && <span>{t("Configured outside Tracel. Start time is unknown; restore it at its source.")}</span>}
        {policy?.disabled && policy.owned && days === null && <span>{t("Start time is unknown. The original setting can still be restored.")}</span>}
        {policy && !policy.supported && <span>{t("This Windows edition is not supported for policy changes.")}</span>}
        <span>{t("Does not cancel an already scheduled restart.")}</span>
        {policyError && <p className="settings-error" role="alert">{t(policyError)}</p>}
      </div>
      <div className="settings-action"><div><strong>{t("Windows Update settings")}</strong></div><Button disabled={!nativeClient} onClick={() => { void open("updates"); }}><ExternalLink size={14} />{t("Open")}</Button></div>
    </SettingsGroup>
    <SettingsGroup title={t("Developer environments")} help={<InfoTip label={t("About environment detection")}>
      <p>{t("Reads registry, PATH, JAVA_HOME and common install directories. Does not execute detected programs or change PATH.")}</p>
      <p>{t("Versions come from installation metadata. Unregistered portable installations, virtual environments and remote paths may be missing. Not found does not mean not installed.")}</p>
      <p>{t("Only .NET SDKs and modern .NET runtimes are listed; .NET Framework is not included.")}</p>
    </InfoTip>}>
      <div className="settings-action system-tools-action"><div><strong>Java · Python · .NET</strong></div>
        <Button disabled={!nativeClient} onClick={() => { void open("environment"); }}><ExternalLink size={14} />{t("PATH settings")}</Button>
        <Button variant="secondary" disabled={!nativeClient || scanBusy} onClick={() => { void scan(); }}><ScanLine size={14} />{t(scanBusy ? "Scanning…" : "Scan")}</Button>
      </div>
      {scanError && <p className="settings-error" role="alert">{t(scanError)}</p>}
      {report && <div className="environment-results">
        {!report.entries.length && <p>{t("No environments found in the scanned locations.")}</p>}
        {report.entries.map((entry) => <div className="environment-entry" key={`${entry.kind}-${entry.path}`}><div><strong>{entry.kind}</strong><span>{t(entry.version)}</span><small>{t(entry.source)}</small></div><code>{entry.path}</code></div>)}
        {report.warnings.map((warning) => <p className="settings-error" key={warning}>{t(warning)}</p>)}
      </div>}
    </SettingsGroup>
    <SettingsGroup title={t("System shortcuts")}>
      <div className="system-shortcuts">{([ ["startup", "Startup apps"], ["apps", "Installed apps"], ["storage", "Storage settings"], ["task-manager", "Task Manager"], ["resources", "Resource Monitor"] ] as const).map(([target, label]) => <Button key={target} disabled={!nativeClient} onClick={() => { void open(target); }}><ExternalLink size={14} />{t(label)}</Button>)}</div>
    </SettingsGroup>
    {shortcutError && <p className="settings-error" role="alert">{t(shortcutError)}</p>}
  </>;
}
