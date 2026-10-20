import { test } from "node:test";
import assert from "node:assert/strict";
import { projectHistoryFrame } from "../src/historyFrame";
import { dayRange } from "../src/recordedTimeline";
import type { ArchivePage, StoredObservation } from "../src/native";

const epoch = dayRange("2026-10-20").startMs;
const process = {instanceId:"42:1",processId:42,name:"Editor.exe",executable:"C:/Editor.exe"};
function page(endMs: number, observations: StoredObservation[]): ArchivePage {
    return { observations, nextCursor: observations.at(-1)?.id ?? 0, firstAtMs: observations[0]?.sample.capturedAtMs ?? null,
        lastAtMs: observations.at(-1)?.sample.capturedAtMs ?? null, intervals: {
            apps:[{id:1,startMs:epoch,endMs,value:process}],
            foreground:[{id:1,startMs:epoch,endMs,value:{process,windowId:"1",title:"Document"}}],media:[],idle:[],
        } };
}
test("60 refreshes publish new tails and state-only changes without freezing or adding context segments", () => {
    const rows: StoredObservation[] = [];
    for (let tick = 1; tick <= 60; tick++) {
        const now = epoch + tick * 2000;
        if (tick % 3) rows.push({ id: tick, sample: {capturedAtMs:now,intervalStartMs:rows.at(-1)?.sample.capturedAtMs ?? epoch,
            cpuPercent:tick,memoryUsedBytes:null,memoryTotalBytes:null,networkReceiveBytesPerSecond:null,networkSendBytesPerSecond:null,
            diskReadBytesPerSecond:null,diskWriteBytesPerSecond:null,audioPeakPercent:null,media:null,errors:[]} });
        const range={start:epoch/1000,end:now/1000};
        const result=projectHistoryFrame(page(now,rows),range,{now,budget:2400,coarse:false,options:{}});
        assert.equal(result.capture.activity.length,1);
        assert.equal(result.capture.activity[0].end,now/1000,"State still advances when no numeric row was appended");
        assert.equal(result.capture.activity[0].contexts.length,1);
        assert.equal(result.stats.foreground,tick*2);
        assert.equal(result.capture.metrics.filter(s=>s.values?.cpu!=null).at(-1)?.values?.cpu,rows.at(-1)?.sample.cpuPercent);
    }
});
test("an interval-only archive refresh remains visible without any numeric rows", () => {
    for(const seconds of [2,4,6]){
        const now=epoch+seconds*1000,range={start:epoch/1000,end:now/1000};
        const result=projectHistoryFrame(page(now,[]),range,{now,budget:1,coarse:false,options:{}});
        assert.equal(result.capture.metrics.length,0);
        assert.equal(result.stats.foreground,seconds);
        assert.equal(result.capture.activity[0].end,now/1000);
    }
});
