import { useEffect, useRef, useState } from "react";
import { useI18n } from "@tracel/timeline";
import { RefreshCw } from "lucide-react";
import { Button } from "./components/ui/Button";
import { Select } from "./components/ui/Select";
import { readDisplayTimeout, setDisplayTimeout, type DisplayTimeout } from "./native";

export function ScreenTimeout({ unavailable }: { unavailable: boolean }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState<DisplayTimeout | null>(null);
  const [ac, setAc] = useState(900); const [dc, setDc] = useState(300);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const request = useRef(false);
  useEffect(() => {
    if (unavailable) return;
    let active = true;
    setBusy(true);
    readDisplayTimeout().then((value) => { if (active) { setCurrent(value); setAc(value.acSeconds); setDc(value.dcSeconds); } })
      .catch((reason) => { if (active) setError(String(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [unavailable]);
  const update = async (save: boolean) => {
    if (request.current || busy) return;
    request.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const value = save && current ? await setDisplayTimeout(current, ac, dc) : await readDisplayTimeout();
      setCurrent(value); setAc(value.acSeconds); setDc(value.dcSeconds);
      if (save) setMessage("Display timeout saved.");
    } catch (reason) { setError(String(reason)); }
    finally { request.current = false; setBusy(false); }
  };
  const options = (value: number) => [...new Set([0, 60, 120, 300, 600, 900, 1800, 3600, 7200, value])].sort((a, b) => a - b)
    .map((seconds) => ({ value: String(seconds), label: !current ? "—" : seconds === 0 ? t("Never") : t("{count} min", { count: Number((seconds / 60).toFixed(2)) }) }));
  const disabled = unavailable || busy || !current;
  return <div className="screen-timeout">
    <div className="settings-action"><div><strong>{t("Display timeout")}</strong><small>{t("Windows power plan · display only, sleep settings unchanged")}</small></div>
      <Button aria-label={t("Refresh display timeout")} title={t("Refresh display timeout")} disabled={unavailable || busy} onClick={() => { void update(false); }}><RefreshCw size={14} /></Button>
    </div>
    <div className="settings-action"><label htmlFor="timeout-ac"><strong>{t("Plugged in")}</strong></label><Select id="timeout-ac" label={t("Plugged in")} value={String(ac)} options={options(ac)} disabled={disabled} onValueChange={(value) => { setAc(Number(value)); setMessage(""); }} /></div>
    <div className="settings-action"><label htmlFor="timeout-dc"><strong>{t("On battery")}</strong></label><Select id="timeout-dc" label={t("On battery")} value={String(dc)} options={options(dc)} disabled={disabled} onValueChange={(value) => { setDc(Number(value)); setMessage(""); }} /></div>
    <div className="settings-action"><small>{t("Changes apply to the current Windows power plan after saving.")}</small><Button variant="secondary" disabled={disabled || (ac === current?.acSeconds && dc === current?.dcSeconds)} onClick={() => { void update(true); }}>{t(busy ? "Applying…" : "Save timeout")}</Button></div>
    {message && <p role="status">{t(message)}</p>}
    {error && <p role="alert" className="settings-error">{t("Could not update display timeout. Refresh and try again.")} {error}</p>}
  </div>;
}
