import { analyze } from "@tracel/timeline/analytics";
import { overlap, sampleEnd, type Capture, type MetricKey, type MetricSample, type Range } from "@tracel/timeline/model";
export type HistoryAnalysis = ReturnType<typeof analyze>;
/** Stitch query boundaries without erasing real changes of window, title or observation gaps. */
function joinContexts(contexts: Capture["activity"][number]["contexts"]) {
    const result: typeof contexts = [], tails = new Map<string, typeof contexts[number]>();
    for (const context of [...contexts].sort((a,b) => a.start - b.start)) {
        const key = JSON.stringify([context.kind, context.title, context.value]), previous = tails.get(key);
        if (previous?.end === context.start) previous.end = context.end;
        else { const copy = { ...context }; result.push(copy); tails.set(key, copy); }
    }
    return result;
}
export function absoluteCapture(data: Capture, range: Range): Capture {
    const offset = Date.parse(data.epoch) / 1000;
    const clip = <T extends Range>(item: T): T => ({ ...item, start: Math.max(range.start, item.start + offset), end: Math.min(range.end, item.end + offset) });
    const metric = data.metrics.filter(s => s.time + offset < range.end && sampleEnd(s, data.samplePeriod) + offset > range.start).map(s => ({ ...s, time: Math.max(range.start, s.time + offset), end: Math.min(range.end, sampleEnd(s, data.samplePeriod) + offset) }));
    return { ...data, epoch: new Date(0).toISOString(), bounds: range, metrics: metric,
        activity: data.activity.map(a => ({ ...clip(a), contexts: a.contexts.map(clip).filter(c => c.start < c.end) })).filter(a => a.start < a.end),
        background: data.background.map(clip).filter(a => a.start < a.end), afk: data.afk.map(clip).filter(a => a.start < a.end),
        media: data.media.map(clip).filter(a => a.start < a.end), events: data.events.map(clip).filter(a => a.start < a.end) };
}
/** Display-only LOD; exact statistics are calculated before this projection. */
export function compactCapture(data: Capture, budget: number): Capture {
    const { start, end } = data.bounds, step = (end - start) / Math.max(1, Math.ceil(budget));
    const bins = new Map<number, Map<MetricKey, {
        total: number;
        coverage: number;
        min: number;
        max: number;
    }>>();
    for (const s of data.metrics)
        for (const [name, v] of Object.entries(s.values ?? {})) {
            if (v == null || !Number.isFinite(v))
                continue;
            const key = name as MetricKey;
            for (let i = Math.max(0, Math.floor((s.time - start) / step)); i < Math.ceil((sampleEnd(s, data.samplePeriod) - start) / step); i++) {
                const weight = overlap({ start: start + i * step, end: Math.min(end, start + (i + 1) * step) }, { start: s.time, end: sampleEnd(s, data.samplePeriod) });
                if (!weight)
                    continue;
                let bin = bins.get(i);
                if (!bin) {
                    bin = new Map();
                    bins.set(i, bin);
                }
                const old = bin.get(key) ?? { total: 0, coverage: 0, min: Infinity, max: -Infinity };
                old.total += v * weight;
                old.coverage += weight;
                old.min = Math.min(old.min, v);
                old.max = Math.max(old.max, v);
                bin.set(key, old);
            }
        }
    const metrics: MetricSample[] = [...bins].sort(([a], [b]) => a - b).map(([i, bin]) => ({ time: start + i * step, end: Math.min(end, start + (i + 1) * step), subject: { kind: "system", id: "system" },
        values: Object.fromEntries([...bin].map(([key, b]) => [key, b.total / b.coverage])), coverage: Object.fromEntries([...bin].map(([key, b]) => [key, b.coverage])),
        extrema: Object.fromEntries([...bin].map(([key, b]) => [key, { min: b.min, max: b.max }])) }));
    // At this scale, one dominant observed event per display cell. Empty cells stay empty.
    const dominant = <T extends Range>(items: T[]): T[] => {
        const selected = new Map<number, {
            item: T;
            weight: number;
        }>();
        for (const item of items)
            for (let i = Math.max(0, Math.floor((item.start - start) / step)); i < Math.ceil((item.end - start) / step); i++) {
                const cell = { start: start + i * step, end: Math.min(end, start + (i + 1) * step) }, weight = overlap(item, cell);
                if (weight > (selected.get(i)?.weight ?? 0))
                    selected.set(i, { item, weight });
            }
        return [...selected].sort(([a], [b]) => a - b).map(([i, { item }]) => ({ ...item, start: start + i * step, end: Math.min(end, start + (i + 1) * step) }));
    };
    const presence = new Map<string, typeof data.background>();
    for (const item of data.background) {
        const list = presence.get(item.appId) ?? [];
        list.push(item);
        presence.set(item.appId, list);
    }
    return { ...data, detailLevel: "aggregate", source: "Tracel recorded timeline · aggregated display", metrics,
        activity: dominant(data.activity).map((a, i) => ({ ...a, id: `lod:${start}:${i}`, contexts: [], windowTitle: "" })),
        background: [...presence.values()].flatMap(dominant), afk: dominant(data.afk), media: dominant(data.media), maxSampleSpan: step };
}
export function combineAnalyses(items: HistoryAnalysis[]): HistoryAnalysis {
    // An entirely unrecorded range still has every standard metric, marked missing.
    if (!items.length) return analyze(combineCaptures([], { start: 0, end: 1 }), { start: 0, end: 1 });
    const apps = new Map<string, HistoryAnalysis["apps"][number]>(), metrics: HistoryAnalysis["metrics"] = { ...items[0]?.metrics };
    for (const key of Object.keys(metrics))
        delete metrics[key as MetricKey];
    const result: HistoryAnalysis = { apps: [], metrics, active: 0, foreground: 0, afk: 0, switches: 0, media: [] };
    for (const item of items) {
        result.active += item.active;
        result.foreground += item.foreground;
        result.afk += item.afk;
        result.switches += item.switches;
        for (const app of item.apps) {
            const old = apps.get(app.id);
            if (old) {
                old.active += app.active;
                old.foreground += app.foreground;
                for (const context of app.contexts) {
                    const last = old.contexts.at(-1);
                    if (last && last.end === context.start && last.kind === context.kind && last.value === context.value && last.title === context.title)
                        last.end = context.end;
                    else
                        old.contexts.push({ ...context });
                }
            }
            else
                apps.set(app.id, { ...app, contexts: app.contexts.map(c => ({ ...c })) });
        }
        for (const [name, m] of Object.entries(item.metrics)) {
            const key = name as MetricKey, old = metrics[key];
            if (!old)
                metrics[key] = { ...m };
            else {
                old.total += m.total;
                old.coverage += m.coverage;
                old.peak = old.peak == null ? m.peak : m.peak == null ? old.peak : Math.max(old.peak, m.peak);
                old.average = old.coverage ? old.total / old.coverage : null;
            }
        }
        for (const m of item.media) {
            const previous = result.media.at(-1);
            if (previous && previous.end === m.start && previous.appId === m.appId && previous.title === m.title && previous.artist === m.artist && previous.state === m.state) {
                previous.end = m.end;
                previous.duration += m.duration;
            }
            else
                result.media.push({ ...m });
        }
    }
    result.apps = [...apps.values()].map(app => ({ ...app, contexts: joinContexts(app.contexts) })).sort((a, b) => b.active - a.active);
    return result;
}
export function combineCaptures(items: Capture[], bounds: Range): Capture {
    const apps = new Map<string, Capture["apps"][number]>(), tracks = new Map<string, NonNullable<Capture["metricTracks"]>[number]>(), overrides: NonNullable<Capture["metricOverrides"]> = {};
    for (const data of items) {
        for (const app of data.apps)
            apps.set(app.id, app);
        for (const track of data.metricTracks ?? []) {
            const old = tracks.get(track.id);
            tracks.set(track.id, { ...track, ...(old?.details || track.details ? { details: [...new Set([...(old?.details ?? []), ...(track.details ?? [])])] } : {}) });
        }
        for (const [name, info] of Object.entries(data.metricOverrides ?? {})) {
            const key = name as MetricKey;
            if (info)
                overrides[key] = { ...info, max: Math.max(info.max ?? 0, overrides[key]?.max ?? 0) };
        }
    }
    const presence = new Map<string, Capture["background"]>();
    for (const data of items)
        for (const item of data.background) {
            const list = presence.get(item.appId) ?? [], last = list.at(-1);
            if (last && item.start <= last.end)
                last.end = Math.max(last.end, item.end);
            else
                list.push({ ...item });
            presence.set(item.appId, list);
        }
    const activity: Capture["activity"] = [];
    for (const event of items.flatMap(d => d.activity).sort((a,b) => a.start - b.start)) {
        const previous = activity.at(-1);
        if (previous && previous.end === event.start && previous.appId === event.appId
            && previous.windowId === event.windowId && previous.processInstanceId === event.processInstanceId
            && previous.windowTitle === event.windowTitle) {
            previous.end = event.end;
            previous.contexts = joinContexts([...previous.contexts, ...event.contexts]);
        } else activity.push({ ...event, contexts: joinContexts(event.contexts) });
    }
    return { kind: "recorded", epoch: new Date(0).toISOString(), bounds, source: items.some(d => d.detailLevel) ? "Tracel recorded history · aggregated display" : "Tracel recorded history", samplePeriod: 2, maxSampleSpan: Math.max(6, ...items.map(d => d.maxSampleSpan ?? 6)),
        ...(items.some(d => d.detailLevel) ? { detailLevel: "aggregate" as const } : {}), apps: [...apps.values()], metricTracks: [...tracks.values()], metricOverrides: overrides,
        metrics: items.flatMap(d => d.metrics).sort((a, b) => a.time - b.time), activity,
        background: [...presence.values()].flat(), afk: items.flatMap(d => d.afk), media: items.flatMap(d => d.media), events: [] };
}
