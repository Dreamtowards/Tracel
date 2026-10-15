import { useEffect, useRef, useState } from "react";
import { getAudioStatus, nativeClient, setAudioMonitor, type AudioSnapshot } from "./native";

/** Host lifetime: navigation does not discard recent sounds or stop the monitor. */
export function useAudioMonitor(visible: boolean) {
  const [status, setStatus] = useState<AudioSnapshot | null>(null);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false), changing = useRef(false);
  const change = async (enabled: boolean) => {
    if (!nativeClient || changing.current) return;
    changing.current = true; setBusy(true); setError("");
    try { setStatus(await setAudioMonitor(enabled)); }
    catch (reason) { setError(String(reason)); }
    finally { changing.current = false; setBusy(false); }
  };
  useEffect(() => {
    if (visible && nativeClient && !started.current) { started.current = true; void change(true); }
  }, [visible]);
  useEffect(() => {
    if (!nativeClient || !(visible || status?.monitoring)) return;
    let active = true; let timer: number;
    const poll = async () => {
      try {
        if (!changing.current) {
          const next = await getAudioStatus();
          if (active && !changing.current) { setStatus(next); setReadError(""); }
        }
      } catch (reason) { if (active) setReadError(String(reason)); }
      finally { if (active) timer = window.setTimeout(poll, 500); }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [visible,status?.monitoring]);
  return { status, error: error || readError, busy, change };
}
