import { useEffect, useMemo, useRef, useState } from "react";
import { nativeClient, queryTimeline, type StoredObservation, type StateIntervals } from "./native";
import { dayRange, localDate, recordedCapture } from "./recordedTimeline";

export function useRecordedTimeline(visible: boolean) {
  const [day, setDay] = useState(localDate);
  const [earliest, setEarliest] = useState(localDate);
  const [rows, setRows] = useState<StoredObservation[]>([]);
  const [intervals, setIntervals] = useState<StateIntervals>();
  const [loadedDay, setLoadedDay] = useState(day);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const cache = useRef<{ day: string; observations: StoredObservation[]; cursor: number; intervals?: StateIntervals }>({ day, observations: [], cursor: 0 });
  useEffect(() => {
    if (!nativeClient || !visible) return;
    if (cache.current.day !== day) cache.current = { day, observations: [], cursor: 0 };
    let active = true, cursor = cache.current.cursor;
    let observations = cache.current.observations;
    let timer: number;
    setRows(observations); setIntervals(cache.current.intervals); setLoadedDay(day); setLoading(true); setError("");
    const poll = async () => {
      try {
        const page = await queryTimeline({ ...dayRange(day), afterId: cursor });
        if (!active) return;
        observations = observations.concat(page.observations);
        if (observations.length > 50000) throw Error("Too many observations for one day.");
        cursor = page.nextCursor;
        cache.current = { day, observations, cursor, intervals: page.intervals };
        setIntervals(page.intervals);
        if (page.firstAtMs != null) setEarliest(localDate(new Date(Math.min(page.firstAtMs,Date.now()))));
        if (page.observations.length || cursor === 0) setRows(observations);
        setError("");
      } catch (reason) { if (active) setError(String(reason)); }
      finally { if (active) { setLoading(false); timer = window.setTimeout(poll, day === localDate() ? 2000 : 15000); } }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [day, visible]);
  const capture = useMemo(() => recordedCapture(day, loadedDay === day ? rows : [], Date.now(), loadedDay === day ? intervals : undefined), [day,loadedDay,rows,intervals]);
  return { capture, error, loading, calendar: { value: day, min: earliest, max: localDate(), onChange: setDay } };
}
