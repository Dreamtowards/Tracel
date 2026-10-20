import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { nativeClient, queryTimeline, type ArchivePage } from "./native";
import { dayRange, localDate } from "./recordedTimeline";
import type { GpuDisplayOptions } from "./gpuNames";
import { clampRange, type Capture, type Range } from "@tracel/timeline/model";
import { combineAnalyses, combineCaptures, type HistoryAnalysis } from "./historyProjection";
import { historyTiles, historyBudget, availableHistory, isLiveContinuation } from "./historyPlanning";
import { overviewContext, type HistoryControls, type HistoryPreview, type HistoryCpuBucket } from "@tracel/timeline/history";
type Result = {
    capture: Capture;
    stats: HistoryAnalysis;
    firstAtMs?: number | null;
    lastAtMs?: number | null;
    firstActivity?: Capture["activity"][number];
    lastActivity?: Capture["activity"][number];
};
function blockStats(items: Result[]) {
    const stats = combineAnalyses(items.map(r => r.stats));
    for (let i = 1; i < items.length; i++) {
        const a = items[i - 1].lastActivity, b = items[i].firstActivity;
        if (a && b && a.end === b.start && a.appId !== b.appId)
            stats.switches++;
    }
    return stats;
}
const sameRange = (a: Range, b: Range) => a.start === b.start && a.end === b.end;
const seconds = (r: {
    startMs: number;
    endMs: number;
}): Range => ({ start: r.startMs / 1000, end: r.endMs / 1000 });
const today = () => dayRange(localDate());
const initialView = () => ({ start: Date.now() / 1000 - 3600, end: Date.now() / 1000 + 120 });
async function readChunk(range: Range): Promise<ArchivePage> {
    try {
        return await queryTimeline({ startMs: Math.floor(range.start * 1000), endMs: Math.ceil(range.end * 1000), afterId: 0 });
    }
    catch (error) {
        if (!/too many (?:state intervals|observations)/i.test(String(error)) || range.end - range.start <= 1)
            throw error;
        const middle = (range.start + range.end) / 2, a = await readChunk({ start: range.start, end: middle }), b = await readChunk({ start: middle, end: range.end });
        const observations = [...new Map([...a.observations, ...b.observations].map(row => [row.id, row])).values()].sort((a, b) => a.id - b.id);
        const join = <T extends {
            id: number;
            startMs: number;
            endMs: number;
        }>(left: T[] = [], right: T[] = []) => [...new Map([...left, ...right].map(i => [`${i.id}:${i.startMs}:${i.endMs}`, i])).values()];
        return { ...b, observations, firstAtMs: a.firstAtMs ?? b.firstAtMs, intervals: { apps: join(a.intervals?.apps, b.intervals?.apps), foreground: join(a.intervals?.foreground, b.intervals?.foreground), media: join(a.intervals?.media, b.intervals?.media), idle: join(a.intervals?.idle, b.intervals?.idle) } };
    }
}
export function useRecordedTimeline(visible: boolean, { simplifyGpuNames, showSoftwareGpus }: GpuDisplayOptions = {}) {
    const [day, setDay] = useState(localDate), [earliest, setEarliest] = useState(localDate);
    const [bounds, setBounds] = useState<Range>(() => ({ start: 0, end: today().endMs / 1000 }));
    const [view, setView] = useState<Range>(initialView), [selection, setSelection] = useState<Range | null>(null);
    const [capture, setCapture] = useState(() => combineCaptures([], seconds(today()))), [analysis, setAnalysis] = useState<HistoryControls["analysis"]>();
    const [error, setError] = useState(""), [overviewError, setOverviewError] = useState(""), [loading, setLoading] = useState(false), [progress, setProgress] = useState("");
    const [requested, setRequested] = useState(view);
    const overviewRange = useMemo(() => overviewContext(view, bounds), [view, bounds]);
    const [previewRequest, setPreviewRequest] = useState(overviewRange), [preview, setPreview] = useState<HistoryPreview>();
    useEffect(() => { const timer = setTimeout(() => setPreviewRequest(overviewRange), 160); return () => clearTimeout(timer); }, [overviewRange]);
    useEffect(() => { const timer = setTimeout(() => setRequested(view), 160); return () => clearTimeout(timer); }, [view]);
    const selected = useRef(selection);
    selected.current = selection;
    const viewAnalysis = useRef<HistoryControls["analysis"]>(undefined);
    const worker = useRef<Worker | null>(null), serial = useRef(0), waiting = useRef(new Map<number, {
        resolve: (r: Result) => void;
        reject: (e: unknown) => void;
    }>());
    const cache = useRef(new Map<string, Result>());
    const firstSample = useRef<number | null | undefined>(undefined);
    const lastPublished = useRef<Range | null>(null);
    useEffect(() => {
        if (!nativeClient)
            return;
        const instance = new Worker(new URL("./history.worker.ts", import.meta.url), { type: "module" });
        worker.current = instance;
        instance.onmessage = event => { const pending = waiting.current.get(event.data.id); if (!pending)
            return; waiting.current.delete(event.data.id); if (event.data.error)
            pending.reject(event.data.error);
        else
            pending.resolve(event.data.result); };
        instance.onerror = event => { for (const pending of waiting.current.values())
            pending.reject(event.message); waiting.current.clear(); };
        return () => { instance.terminate(); worker.current = null; for (const pending of waiting.current.values())
            pending.reject("History worker closed"); waiting.current.clear(); };
    }, []);
    const project = useCallback((page: ArchivePage, range: Range, budget: number, coarse: boolean) => new Promise<Result>((resolve, reject) => {
        if (!worker.current) {
            reject("History worker unavailable");
            return;
        }
        const id = ++serial.current;
        waiting.current.set(id, { resolve, reject });
        worker.current.postMessage({ id, page, range, budget, coarse, now: Date.now(), options: { simplifyGpuNames, showSoftwareGpus } });
    }), [simplifyGpuNames, showSoftwareGpus]);
    useEffect(() => {
        if (!nativeClient || !visible)
            return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const startMs = Math.floor(previewRequest.start * 1000), endMs = Math.ceil(previewRequest.end * 1000);
                const ranges = Array.from({ length: 7 }, (_, i) => [startMs + Math.floor((endMs-startMs)*i/7), startMs + Math.floor((endMs-startMs)*(i+1)/7)]);
                const overview = await invoke<{
                    cpu: HistoryCpuBucket[];
                    firstAtMs: number | null;
                    lastAtMs: number | null;
                }>("timeline_overview", { days: ranges });
                if (!active)
                    return;
                firstSample.current = overview.firstAtMs;
                setPreview({ range: previewRequest, cpu: overview.cpu });
                setOverviewError("");
                if (overview.firstAtMs != null)
                    setEarliest(localDate(new Date(overview.firstAtMs)));
                setBounds(previous => { const next = { start: 0, end: today().endMs / 1000 }; return sameRange(previous, next) ? previous : next; });
            }
            catch (reason) {
                if (active)
                    setOverviewError(String(reason));
            }
            finally {
                if (active)
                    timer = setTimeout(poll, 30000);
            }
        };
        void poll();
        return () => { active = false; clearTimeout(timer); };
    }, [previewRequest, visible]);
    useEffect(() => {
        if (!nativeClient || !visible)
            return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        const span = requested.end - requested.start, coarse = span > 6 * 3600;
        let hasPublished = false;
        const run = async () => {
            const available = availableHistory(requested, firstSample.current);
            const tiles = available ? historyTiles(available) : [];
            const budget = coarse ? historyBudget(tiles[0]?.range ?? requested, span) : 2400;
            // Background polling preserves the ready UI until its replacement is complete.
            if (!hasPublished && !isLiveContinuation(lastPublished.current, requested)) setLoading(true);
            setError("");
            const results = new Map<string, Result>();
            for (const tile of tiles) {
                const r = { start: Math.max(tile.range.start, requested.start), end: Math.min(tile.range.end, requested.end) }, key = `${r.start}:${r.end}:${budget}:${coarse}:${simplifyGpuNames}:${showSoftwareGpus}`, cached = cache.current.get(key);
                if (cached)
                    results.set(tile.key, cached);
            }
            const publish = () => {
                const ordered = tiles.flatMap(t => results.has(t.key) ? [results.get(t.key)!] : []), combined = combineCaptures(ordered.map(r => r.capture), bounds);
                const latest = Math.max(0, ...ordered.map(r => r.lastAtMs ?? 0));
                const edge = (latest >= today().startMs ? latest / 1000 : Math.floor(Date.now() / 2000) * 2) + 120;
                combined.initialView = { start: edge - 3600, end: edge };
                setCapture(combined);
                lastPublished.current = requested;
                setProgress(`${results.size}/${tiles.length}`);
                viewAnalysis.current = { range: requested, stats: blockStats(ordered), pending: results.size < tiles.length };
                if (!selected.current)
                    setAnalysis(viewAnalysis.current);
            };
            try {
                const fetches = new Map<string, Promise<ArchivePage>>();
                const prefetch = (index: number) => {
                    const tile = tiles[index];
                    if (!tile) return;
                    const range = { start: Math.max(tile.range.start, requested.start), end: Math.min(tile.range.end, requested.end) };
                    const key = `${range.start}:${range.end}:${budget}:${coarse}:${simplifyGpuNames}:${showSoftwareGpus}`;
                    const recent = tile.range.end * 1000 > Date.now() - 6000 && tile.range.start * 1000 < Date.now() + 2000;
                    if (!cache.current.has(key) || recent) {
                        const promise = readChunk(range);
                        void promise.catch(() => {});
                        fetches.set(tile.key, promise);
                    }
                };
                prefetch(0); prefetch(1);
                for (let index = 0; index < tiles.length; index++) {
                    const tile = tiles[index];
                    if (!active) return;
                    const range = { start: Math.max(tile.range.start, requested.start), end: Math.min(tile.range.end, requested.end) }, key = `${range.start}:${range.end}:${budget}:${coarse}:${simplifyGpuNames}:${showSoftwareGpus}`;
                    const current = tile.range.end * 1000 > Date.now() - 6000 && tile.range.start * 1000 < Date.now() + 2000;
                    let result = cache.current.get(key);
                    if (!result || current) {
                        const page = await (fetches.get(tile.key) ?? readChunk(range));
                        fetches.delete(tile.key);
                        firstSample.current = page.firstAtMs;
                        if (!active)
                            return;
                        result = await project(page, range, budget, coarse);
                        if (!active)
                            return;
                        // Live windows move every poll; retaining each one only accumulates obsolete pictures.
                        if (!current) cache.current.set(key, result);
                        let weight = 0;
                        for (const entry of cache.current.values())
                            weight += entry.capture.metrics.length + entry.capture.activity.length + entry.capture.background.length + entry.capture.media.length;
                        while ((weight > 100000 || cache.current.size > 1024) && cache.current.size > 1) {
                            const oldest = cache.current.keys().next().value!, entry = cache.current.get(oldest)!;
                            weight -= entry.capture.metrics.length + entry.capture.activity.length + entry.capture.background.length + entry.capture.media.length;
                            cache.current.delete(oldest);
                        }
                    }
                    results.set(tile.key, result);
                    prefetch(index + 2);
                    if (!hasPublished) setProgress(`${results.size}/${tiles.length}`);
                }
                // Commit one complete snapshot, never a mixture of refreshed and missing tiles.
                publish();
                hasPublished = true;
            }
            catch (reason) {
                if (active)
                    setError(String(reason));
            }
            finally {
                if (active) {
                    setLoading(false);
                    if (requested.end * 1000 > Date.now() - 6000) timer = setTimeout(run, coarse ? 30000 : 2000);
                }
            }
        };
        const start = setTimeout(() => void run(), 0);
        return () => { active = false; clearTimeout(start); clearTimeout(timer); };
    }, [requested, bounds, visible, project]);
    useEffect(() => {
        if (!selection) {
            if (viewAnalysis.current)
                setAnalysis(viewAnalysis.current);
            return;
        }
        if (!nativeClient || !visible)
            return;
        let active = true;
        const timer = setTimeout(async () => {
            setAnalysis(previous => previous ? { ...previous, pending: true } : previous);
            const results: Result[] = [];
            try {
                const available = availableHistory(selection, firstSample.current);
                for (const tile of available ? historyTiles(available) : []) {
                    const range = { start: Math.max(selection.start, tile.range.start), end: Math.min(selection.end, tile.range.end) };
                    const page = await readChunk(range);
                    if (!active)
                        return;
                    const result = await project(page, range, 1, true);
                    if (!active)
                        return;
                    results.push(result);
                }
                setAnalysis({ range: selection, stats: blockStats(results), pending: false });
            }
            catch (reason) {
                if (active)
                    setError(String(reason));
            }
        }, 180);
        return () => { active = false; clearTimeout(timer); };
    }, [selection, visible, project]);
    const onView = useCallback((next: Range) => setView(previous => sameRange(previous, next) ? previous : clampRange(next, bounds)), [bounds]);
    const changeDay = useCallback((next: string) => { setDay(next); setSelection(null); setView(next === localDate() ? initialView() : seconds(dayRange(next))); }, []);
    const history: HistoryControls = { view, onView, selection, onSelection: setSelection, overviewRange, preview, loading, progress, analysis };
    return { capture, error: error || overviewError, loading, history, calendar: { value: day, min: earliest, max: localDate(), onChange: changeDay } };
}
