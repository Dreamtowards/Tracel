import { useCallback, useEffect, useRef, useState } from "react";
import { getCollectionStatus, getSystemHistory, nativeClient, setCollectionSettings, setKeepAwake, type CollectionSettings, type CollectionStatus, type SystemObservation } from "./native";

export function useCollection(historyVisible: boolean) {
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [history, setHistory] = useState<SystemObservation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    if (!nativeClient) return;
    let active = true;
    let timer: number;
    const poll = async () => {
      const current = generation.current;
      if (!mutation.current) {
        try {
          const result = await getCollectionStatus();
          const samples = historyVisible ? await getSystemHistory() : null;
          if (active && current === generation.current && !mutation.current) {
            setStatus(result); if (samples) setHistory(samples); setError("");
          }
        } catch {
          if (active && current === generation.current) setError("Could not read collector status. Retrying…");
        }
      }
      if (active) timer = window.setTimeout(poll, 2000);
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [historyVisible]);
  const update = useCallback(async (request: () => Promise<CollectionStatus>) => {
    if (mutation.current) return;
    mutation.current = true; generation.current += 1; setBusy(true); setError("");
    try { setStatus(await request()); }
    catch { setError("Could not apply the change. Your previous settings are still active."); }
    finally { mutation.current = false; generation.current += 1; setBusy(false); }
  }, []);
  return {
    status, history, error, busy,
    changeSettings: (settings: CollectionSettings) => update(() => setCollectionSettings(settings)),
    changeAwake: (enabled: boolean) => update(() => setKeepAwake(enabled)),
  };
}
