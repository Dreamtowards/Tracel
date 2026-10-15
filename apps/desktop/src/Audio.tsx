import { useState } from "react";
import { useI18n } from "@tracel/timeline";
import { ExternalLink, Mic, Pause, Play, Volume2 } from "lucide-react";
import { Button } from "./components/ui/Button";
import { Select } from "./components/ui/Select";
import { SettingsGroup } from "./components/SettingsGroup";
import { InfoTip } from "./components/ui/InfoTip";
import { nativeClient, openSoundSettings } from "./native";
import type { useAudioMonitor } from "./useAudioMonitor";
import type { useMediaSessions } from "./useMediaSessions";

export default function Audio({ monitor, media }: { monitor: ReturnType<typeof useAudioMonitor>; media: ReturnType<typeof useMediaSessions> }) {
  const { t,locale } = useI18n();
  const { status,busy,error,change } = monitor;
  const mediaRows = (media.snapshot?.sessions ?? []).filter((session) => session.playbackStatus === "Playing" || session.playbackStatus === "Paused");
  const [device,setDevice] = useState("all"), [recent,setRecent] = useState(false);
  const [settingsError,setSettingsError] = useState("");
  const devices = status?.devices ?? [], sessions = status?.sessions ?? [];
  const outputs = devices.filter((d)=>d.direction === "output");
  const selected = device === "all" || outputs.some((d)=>d.id === device) ? device : "all";
  const rows = sessions.filter((s)=>(selected === "all" || s.deviceId === selected) && (!recent || s.lastHeardAtMs != null));
  const defaults = (direction: string, role: string) => devices.filter((d)=>d.direction === direction && d.defaultRoles.includes(role)).map((d)=>d.name).join(", ") || "—";
  const settings = async () => { setSettingsError(""); try { await openSoundSettings(); } catch(reason) { setSettingsError(String(reason)); } };
  return <div className="desktop-page audio-page">
    <header className="desktop-page-heading"><h1>{t("Audio")}</h1><Button variant="secondary" disabled={!nativeClient || busy} onClick={()=>{void change(!status?.monitoring);}}>{status?.monitoring ? <Pause size={14}/> : <Play size={14}/>} {t(status?.monitoring ? "Pause monitoring" : "Start monitoring")}</Button></header>
    {!nativeClient && <p className="settings-banner">{t("Preview: native features require the Windows client.")}</p>}
    {error && <p role="alert" className="settings-error">{error}</p>}
    {status?.errors.length ? <div role="alert" className="settings-error">{status.errors.map((message,i)=><div key={i}>{message}</div>)}</div> : null}
    <SettingsGroup title={t("Devices")}>
      <div className="audio-defaults">{([['output','Default output',Volume2],['input','Default input',Mic]] as const).map(([direction,label,Icon])=><div key={direction}><span><Icon size={15}/>{t(label)}</span><strong>{defaults(direction,"multimedia")}</strong><small>{t("Communications")}: {defaults(direction,"communications")}</small></div>)}</div>
      <div className="settings-action"><div><small>{t("Change default devices in Windows sound settings. This page updates automatically while monitoring.")}</small></div><Button disabled={!nativeClient} onClick={()=>{void settings();}}><ExternalLink size={14}/>{t("Windows sound settings")}</Button></div>
      {settingsError && <p role="alert" className="settings-error">{settingsError}</p>}
    </SettingsGroup>
    <SettingsGroup title={t("Media sessions")}>
      <ul className="audio-sessions audio-media">{mediaRows.map((session,index) => <li key={`${session.application}:${index}`} className={session.playbackStatus === "Paused" ? "is-paused" : undefined}>
        <div className="audio-session-heading"><div><strong>{session.title || t("Untitled media")}</strong>{session.artist && <small>{session.artist}</small>}</div><span>{t(session.playbackStatus === "Playing" ? "playing" : "paused")}</span></div>
        <div className="audio-session-detail"><span>{session.application}</span></div>
      </li>)}</ul>
      {media.error && <p role="alert" className="settings-error">{t("Could not refresh media sessions. Previous results may be stale.")} {media.error}</p>}
      {media.snapshot?.errors.map((message,index) => <p role="alert" className="settings-error" key={index}>{message}</p>)}
      {!mediaRows.length && !media.error && <p role="status" className="audio-empty">{t(!nativeClient ? "Open the Windows client to inspect media sessions." : media.loading ? "Reading media sessions…" : !status?.monitoring ? "Monitoring paused." : "No playing or paused media sessions.")}</p>}
      <p className="settings-footnote">{t(status?.monitoring ? "All Windows media sessions · updates while this page is open" : "Monitoring paused. Recent results are frozen.")}</p>
      <p className="settings-footnote">{t("Only apps publishing Windows media information appear here. Application audio below can detect sound without song metadata.")}</p>
    </SettingsGroup>
    <SettingsGroup title={t("Application audio")} help={<InfoTip label={t("About application audio")}>
      <p>{t(status?.monitoring ? "Monitoring continues on other pages. Recent sounds stay for 60 seconds." : "Monitoring paused. Recent results are frozen.")}</p>
      <p>{t("Signal levels are sampled, not recordings. Very short sounds, exclusive playback and protected apps may be missed.")}</p>
    </InfoTip>}>
      <div className="audio-filters"><div className="audio-filter-buttons"><Button variant={!recent ? "secondary" : "ghost"} aria-pressed={!recent} onClick={()=>setRecent(false)}>{t("All sessions")}</Button><Button variant={recent ? "secondary" : "ghost"} aria-pressed={recent} onClick={()=>setRecent(true)}>{t("Recent sounds")}</Button></div><Select id="audio-output" label={t("Output device")} value={selected} onValueChange={setDevice} options={[{value:"all",label:t("All outputs")},...outputs.map((d)=>({value:d.id,label:d.name}))]}/></div>
      <ul className="audio-sessions">{rows.map((session)=>{
        const exe = session.executable?.split(/[\\/]/).at(-1);
        return <li key={session.id}>
          <div className="audio-session-heading"><div><strong>{session.systemSounds ? t("System sounds") : session.name}</strong>{exe && exe !== session.name && <small title={session.executable ?? undefined}>{exe}</small>}<small>PID {session.processId}{session.multiProcess ? ` · ${t("Shared session")}` : ""}</small></div><span>{session.muted ? t("Muted") : session.peakPercent == null ? "—" : `${session.peakPercent.toFixed(1)}%`}</span></div>
          <div className={`audio-meter${session.muted ? " muted" : ""}`} role="meter" aria-label={t("{name} signal level",{name:session.name})} aria-valuemin={0} aria-valuemax={100} aria-valuenow={session.peakPercent ?? undefined} aria-valuetext={session.peakPercent == null ? t("Unavailable") : undefined}><i style={{width:`${session.peakPercent ?? 0}%`}}/></div>
          <div className="audio-session-detail"><span>{devices.find((d)=>d.id === session.deviceId)?.name ?? t("Disconnected output")}</span><span>{t("Volume")}: {session.volumePercent == null ? "—" : `${session.volumePercent.toFixed(0)}%`}</span><span>{t(session.state === "ended" ? "Session ended" : session.state === "active" ? "Active" : "Inactive")}</span></div>
          {session.lastHeardAtMs != null && <div className="audio-session-last"><span>{t("Last signal")}: {new Date(session.lastHeardAtMs).toLocaleTimeString(locale,{hour12:false})}</span><span>{t("Peak")}: {session.heldPeakPercent.toFixed(1)}%</span></div>}
        </li>;
      })}</ul>
      {!rows.length && <p role="status" className="audio-empty">{t(!nativeClient ? "Open the Windows client to inspect application audio." : !status?.capturedAtMs && status?.monitoring ? "Connecting to audio devices…" : recent ? "No sounds detected in the last minute." : "No audio sessions on these outputs.")}</p>}
    </SettingsGroup>
  </div>;
}
