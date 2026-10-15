import { useEffect, useState } from "react";
import { getMediaSessions, nativeClient, type MediaSessions } from "./native";

/** Audio-page diagnostics only; never blocks the independent signal-meter worker. */
export function useMediaSessions(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<MediaSessions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!nativeClient || !enabled) { setLoading(false); return; }
    let active = true;
    let timer: number;
    setLoading(true);
    const poll = async () => {
      try {
        const result = await getMediaSessions();
        if (active) { setSnapshot(result); setError(""); }
      } catch (reason) {
        if (active) setError(String(reason));
      } finally {
        if (active) { setLoading(false); timer = window.setTimeout(poll, 2000); }
      }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [enabled]);
  return { snapshot, loading, error };
}
