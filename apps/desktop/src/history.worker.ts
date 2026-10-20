import { projectHistoryFrame } from "./historyFrame";
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
        self.postMessage({ id, result: projectHistoryFrame(page, range, { now, budget, coarse, options, analysisRange }) });
    }
    catch (error) {
        self.postMessage({ id, error: String(error) });
    }
};
