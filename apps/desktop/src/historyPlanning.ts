import type { Range } from "@tracel/timeline/model";
import { dayRange, localDate } from "./recordedTimeline";

/** Calendar-day batches amortize IPC and SQL work without dropping observations. */
export function historyTiles(range: Range) {
    const daily = range.end - range.start > 2 * 86400;
    const result: { range: Range; key: string }[] = [];
    let start = daily ? dayRange(localDate(new Date(range.start * 1000))).startMs / 1000
        : Math.max(Math.floor(range.start / 3600) * 3600, dayRange(localDate(new Date(range.start * 1000))).startMs / 1000);
    while (start < range.end) {
        const midnight = dayRange(localDate(new Date(start * 1000))).endMs / 1000;
        const end = daily ? midnight : Math.min(start + 3600, midnight);
        result.push({ range: { start, end }, key: `${start}:${end}` });
        start = end;
    }
    return result;
}

/** Continuous context around the viewport, independent of navigation presets. */
export function historyContext(view: Range, limit: Range): Range {
    const padding = Math.max(3600, (view.end - view.start) / 4);
    return { start: Math.max(limit.start, view.start - padding), end: Math.min(limit.end, view.end + padding) };
}

export function historyBudget(range: Range, viewSpan = range.end - range.start) {
    // Bound the entire view, not each day independently; quantized levels reuse nearby zooms.
    const target = Math.max(1, Math.min(256, 2400 * (range.end - range.start) / viewSpan));
    return 2 ** Math.floor(Math.log2(target));
}

/** Skip the provably empty time before the first archived sample, including its rate support. */
export function availableHistory(range: Range, firstAtMs: number | null | undefined): Range | null {
    if (firstAtMs === null) return null;
    const start = firstAtMs === undefined ? range.start : Math.max(range.start, firstAtMs / 1000 - 6);
    return start < range.end ? { start, end: range.end } : null;
}

/** Following the next live samples refreshes an existing picture, rather than starting a new load. */
export function isLiveContinuation(previous: Range | null, next: Range, nowMs = Date.now()) {
    return !!previous && next.end * 1000 > nowMs - 6000
        && Math.abs((next.end - next.start) - (previous.end - previous.start)) < .001
        && next.start >= previous.start && next.start - previous.start <= 6;
}
