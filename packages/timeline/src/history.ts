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
export type HistoryControls = {
    view: Range;
    onView: (range: Range) => void;
    selection: Range | null;
    onSelection: (range: Range | null) => void;
    days: HistoryDay[];
    period: 7 | 30;
    onPeriod: (period: 7 | 30) => void;
    loading: boolean;
    progress: string;
    analysis?: {
        range: Range;
        stats: Analysis;
        pending: boolean;
    };
};
