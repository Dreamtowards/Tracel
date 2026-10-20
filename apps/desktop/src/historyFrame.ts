import { recordedCapture, localDate } from "./recordedTimeline";
import { analyze } from "@tracel/timeline/analytics";
import { absoluteCapture, compactCapture } from "./historyProjection";
import type { ArchivePage } from "./native";
import type { GpuDisplayOptions } from "./gpuNames";
import type { Range } from "@tracel/timeline/model";

/** Each page is one authoritative numeric + state snapshot, including state-only updates. */
export function projectHistoryFrame(page: ArchivePage, range: Range, {
    now, budget, coarse, options, analysisRange = range,
}: { now: number; budget: number; coarse: boolean; options: GpuDisplayOptions; analysisRange?: Range }) {
    const raw = recordedCapture(localDate(new Date(range.start * 1000)), page.observations, now, page.intervals, options);
    const exact = absoluteCapture(raw, range), stats = analyze(exact, analysisRange);
    return { capture: coarse ? compactCapture(exact, budget) : exact, stats,
        firstActivity: exact.activity[0], lastActivity: exact.activity.at(-1), firstAtMs: page.firstAtMs, lastAtMs: page.lastAtMs };
}
