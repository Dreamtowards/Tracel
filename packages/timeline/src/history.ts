import type { analyze } from "./analytics";
import type { Range } from "./model";
export type Analysis = ReturnType<typeof analyze>;
export type HistoryDay = {
    startMs: number;
    endMs: number;
    activeMs: number;
    foregroundMs: number;
    sampleCount: number;
};
export type HistoryCpuBucket = { startMs: number; endMs: number; value: number };
export type HistoryPreview = { range: Range; cpu: HistoryCpuBucket[] };

/** Geometry follows input immediately; fetching the numeric preview can be debounced. */
export function overviewContext(view: Range, bounds: Range, navigationContext?: Range | null): Range {
    if (navigationContext) return navigationContext;
    const padding = Math.max(3600, (view.end - view.start) / 4);
    return { start: Math.max(bounds.start, view.start - padding), end: Math.min(bounds.end, view.end + padding) };
}
export type HistoryControls = {
    view: Range;
    onView: (range: Range) => void;
    /** An overview gesture moves inside its existing coordinate system until another navigation source takes over. */
    onOverviewView?: (range: Range, context: Range) => void;
    selection: Range | null;
    onSelection: (range: Range | null) => void;
    overviewRange: Range;
    preview?: HistoryPreview;
    loading: boolean;
    progress: string;
    analysis?: {
        range: Range;
        stats: Analysis;
        pending: boolean;
    };
};
