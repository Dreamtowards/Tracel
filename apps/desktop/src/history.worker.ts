import { recordedCapture, localDate } from "./recordedTimeline";
import { analyze } from "@tracel/timeline/analytics";
import { absoluteCapture, compactCapture } from "./historyProjection";
import type { ArchivePage } from "./native";
import type { GpuDisplayOptions } from "./gpuNames";
import type { Range } from "@tracel/timeline/model";
self.onmessage = (event: MessageEvent<{
    id: number;
    page: ArchivePage;
    range: Range;
    analysisRange?: Range;
    now: number;
    budget: number;
    coarse: boolean;
    options: GpuDisplayOptions;
}>) => {
    const { id, page, range, analysisRange, now, budget, coarse, options } = event.data;
    try {
        const raw = recordedCapture(localDate(new Date(range.start * 1000)), page.observations, now, page.intervals, options);
        const exact = absoluteCapture(raw, range), stats = analyze(exact, analysisRange ?? range);
        self.postMessage({ id, result: { capture: coarse ? compactCapture(exact, budget) : exact, stats, firstActivity: exact.activity[0], lastActivity: exact.activity.at(-1), firstAtMs: page.firstAtMs, lastAtMs: page.lastAtMs } });
    }
    catch (error) {
        self.postMessage({ id, error: String(error) });
    }
};
