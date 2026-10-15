import { test } from "node:test";
import assert from "node:assert/strict";
import { recordedCapture, dayRange } from "../src/recordedTimeline";
import { analyze } from "@tracel/timeline/analytics";
import { metricAt } from "@tracel/timeline/model";
import { overviewPath } from "../../../packages/timeline/src/overview";
import type { StoredObservation, SystemObservation } from "../src/native";

const day = "2026-10-15", epoch = dayRange(day).startMs;
function row(id: number, second: number, changes: Partial<SystemObservation> = {}): StoredObservation {
  return { id, sample: { capturedAtMs: epoch + second * 1000, intervalStartMs: null,
    cpuPercent: null, memoryUsedBytes: null, memoryTotalBytes: null, networkReceiveBytesPerSecond: null, networkSendBytesPerSecond: null,
    diskReadBytesPerSecond: null, diskWriteBytesPerSecond: null, audioPeakPercent: null, media: null, errors: [], ...changes } };
}
test("recorded timeline uses real support intervals, independent missing values and UTC epoch", () => {
  const capture = recordedCapture(day,[row(1,100),row(2,103,{intervalStartMs:epoch+100000,cpuPercent:0,networkReceiveBytesPerSecond:2*1024**2}),row(3,120,{cpuPercent:99})],epoch+200000);
  const stats = analyze(capture,{start:100,end:120});
  assert.equal(capture.epoch,new Date(epoch).toISOString());
  assert.deepEqual(capture.activity,[]); assert.deepEqual(capture.afk,[]); assert.deepEqual(capture.background,[]);
  assert.equal(stats.metrics.cpu.average,0); assert.equal(stats.metrics.cpu.coverage,3);
  assert.equal(stats.metrics.download.total,6); assert.equal(stats.metrics.download.coverage,3);
  assert.equal(stats.metrics.ram.average,null); assert.equal(stats.metrics.gpu.average,null);
  assert.equal(metricAt(capture,101,"cpu"),0); assert.equal(metricAt(capture,103,"cpu"),null);
  assert.equal(metricAt(capture,115,"download"),null);
});
test("gauges and sampled media merge only while continuous and preserve state changes/gaps", () => {
  const media = {title:"曲目",artist:"Artist",application:"player.app",playbackStatus:"Playing"};
  const capture = recordedCapture(day,[row(1,10,{media,memoryUsedBytes:8*1024**3,memoryTotalBytes:64*1024**3}),row(2,13,{intervalStartMs:epoch+10000,media}),row(3,16,{intervalStartMs:epoch+13000,media:{...media,playbackStatus:"Paused"}}),row(4,30,{media})],epoch+100000);
  assert.deepEqual(capture.media.map(({start,end,state})=>({start,end,state})),[{start:10,end:16,state:"playing"},{start:16,end:18,state:"paused"},{start:30,end:32,state:"playing"}]);
  assert.equal(capture.metricOverrides?.ram?.max,64);
  assert.equal(analyze(capture,{start:10,end:16}).metrics.ram.coverage,3);
  const reset = recordedCapture(day,[row(1,10,{audioPeakPercent:0}),row(2,11,{audioPeakPercent:0})],epoch+100000);
  assert.equal(analyze(reset,{start:10,end:13}).metrics.audio.coverage,3,"fast settings wake-up must not overlap gauge support");
});
test("calendar-day clipping preserves counter intervals crossing midnight", () => {
  const capture = recordedCapture(day,[row(1,1,{intervalStartMs:epoch-1000,networkSendBytesPerSecond:1024**2})],epoch+100000);
  assert.equal(analyze(capture,{start:0,end:10}).metrics.upload.total,1);
  assert.equal(capture.metrics[0].time,0); assert.equal(capture.metrics[0].end,1);
});
test("CPU overview ignores interleaved gauge rows but breaks real collection gaps", () => {
  const capture = recordedCapture(day,[row(1,10,{memoryUsedBytes:100}),row(2,12,{intervalStartMs:epoch+10000,cpuPercent:10,memoryUsedBytes:100}),row(3,14,{intervalStartMs:epoch+12000,cpuPercent:20}),row(4,30,{intervalStartMs:epoch+28000,cpuPercent:30})],epoch+100000);
  const path = overviewPath(capture);
  assert.equal((path.match(/M/g) ?? []).length,2);
  assert.ok(path.includes("L"));
  assert.ok(!path.includes("NaN"));
});
test("a full day stays bounded and does not spread large arrays into the call stack", () => {
  const rows = Array.from({length:43200},(_,i)=>row(i+1,i*2,{intervalStartMs:i ? epoch+(i-1)*2000 : null,cpuPercent:i?10:null,memoryUsedBytes:8*1024**3,memoryTotalBytes:32*1024**3,networkReceiveBytesPerSecond:1024**2}));
  const capture = recordedCapture(day,rows,epoch+86400000);
  assert.equal(capture.metrics.length,86399);
  assert.equal(analyze(capture,{start:0,end:86400}).metrics.download.coverage,86398);
});
