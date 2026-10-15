import { test } from "node:test";
import assert from "node:assert/strict";
import { recordedCapture, dayRange } from "../src/recordedTimeline";
import { analyze } from "@tracel/timeline/analytics";
import { metricAt } from "@tracel/timeline/model";
import { overviewPath } from "../../../packages/timeline/src/overview";
import type { StoredObservation, SystemObservation } from "../src/native";

const day = "2026-10-15", epoch = dayRange(day).startMs;
test("hardware tracks keep adapters, measured engines, gauge support and missing power states distinct", () => {
  const gpu = { id:"a",name:"GPU A",utilizationPercent:80,engines:[{id:"0",name:"3D #0",utilizationPercent:80},{id:"1",name:"Compute #1",utilizationPercent:0}],dedicatedUsedBytes:2*1024**3,sharedUsedBytes:0 };
  const capture = recordedCapture(day,[row(1,10,{cpuFrequencyMhz:3200,battery:{present:true,percent:50,pluggedIn:true,charging:false}}),
    row(2,12,{intervalStartMs:epoch+10000,gpus:[gpu,{...gpu,id:"b",name:"GPU B",utilizationPercent:20}],cpuFrequencyMhz:4000,battery:{present:true,percent:51,pluggedIn:null,charging:null}}),
    row(3,30,{gpus:[{...gpu,utilizationPercent:null,engines:[],sharedUsedBytes:null}]})],epoch+100000);
  assert.equal(metricAt(capture,11,"gpu:a:total"),80);
  assert.equal(metricAt(capture,11,"gpu:b:total"),20);
  assert.equal(metricAt(capture,11,"gpu"),80,"overall GPU percentages must not sum adapters");
  assert.equal(metricAt(capture,11,"gpu:a:engine:1"),0);
  assert.equal(metricAt(capture,12,"gpu:a:total"),null,"utilization covers the preceding interval");
  assert.equal(metricAt(capture,13,"gpu:a:dedicated"),2);
  assert.equal(metricAt(capture,13,"gpu:a:shared"),0);
  assert.equal(metricAt(capture,20,"gpu:a:dedicated"),null);
  assert.equal(metricAt(capture,31,"gpu:a:total"),null,"no counter interval must not invent utilization");
  assert.equal(metricAt(capture,31,"gpu:a:shared"),null);
  assert.equal(metricAt(capture,11,"cpuFrequency"),3.2);
  assert.equal(metricAt(capture,11,"pluggedIn"),1);
  assert.equal(metricAt(capture,11,"charging"),0,"plugged in does not imply charging");
  assert.equal(metricAt(capture,13,"pluggedIn"),null);
  assert.equal(metricAt(capture,13,"battery"),51);
  assert.equal(capture.metricTracks?.filter((track)=>track.details).length,2);
  assert.equal(capture.metricTracks?.find((track)=>track.id==="cpuFrequency")?.after,"cpu");
  const stats = analyze(capture,{start:10,end:30});
  assert.equal(stats.metrics["gpu:a:engine:0"].average,80);
  assert.equal(stats.metrics["gpu:a:engine:0"].coverage,2);
});
test("old history has no invented hardware tracks and a desktop power source has no battery lane", () => {
  assert.deepEqual(recordedCapture(day,[row(1,10)],epoch+100000).metricTracks,[]);
  const capture = recordedCapture(day,[row(1,10,{battery:{present:false,percent:null,pluggedIn:true,charging:null}})],epoch+100000);
  assert.deepEqual(capture.metricTracks?.map((track)=>track.id),["power"]);
  assert.equal(metricAt(capture,11,"battery"),null);
});
test("normalized state intervals clip at midnight, union process presence, and retain title/media boundaries", () => {
  const process = { instanceId: "42:1234", processId: 42, name: "Editor.exe", executable: "C:\\Editor.exe" };
  const intervals = {
    apps: [
      { id: 1, startMs: epoch-1000, endMs: epoch+4000, value: process },
      { id: 2, startMs: epoch+2000, endMs: epoch+6000, value: { ...process, instanceId: "43:2345", processId: 43 } },
      { id: 3, startMs: epoch+10000, endMs: epoch+12000, value: process },
    ],
    foreground: [
      { id: 1, startMs: epoch-1000, endMs: epoch+2000, value: { process, windowId: "100", title: "项目 A" } },
      { id: 2, startMs: epoch+2000, endMs: epoch+6000, value: { process, windowId: "100", title: "项目 B" } },
    ],
    media: [
      { id: 1, startMs: epoch-1000, endMs: epoch+4000, value: { application: "player", title: "Song", artist: "Artist", playbackStatus: "Playing" } },
      { id: 2, startMs: epoch+4000, endMs: epoch+6000, value: { application: "player", title: "Song", artist: "Artist", playbackStatus: "Paused" } },
    ],
    idle: [{ id: 1, startMs: epoch+1000, endMs: epoch+6000, value: null }],
  };
  const capture = recordedCapture(day, [row(1,2,{intervalStartMs:epoch,cpuPercent:0})], epoch+11000, intervals);
  assert.deepEqual(capture.background.map(({start,end})=>({start,end})),[{start:0,end:6},{start:10,end:11}]);
  assert.deepEqual(capture.activity.map(({start,end,windowTitle})=>({start,end,windowTitle})),[{start:0,end:2,windowTitle:"项目 A"},{start:2,end:6,windowTitle:"项目 B"}]);
  assert.deepEqual(capture.media.map(({start,end,state})=>({start,end,state})),[{start:0,end:4,state:"playing"},{start:4,end:6,state:"paused"}]);
  assert.equal(capture.metrics[0].values?.cpu,0);
  assert.equal(capture.apps.filter((app)=>app.name==="Editor.exe").length,1);
  assert.equal(capture.activity[0].processInstanceId,process.instanceId);
  assert.deepEqual(capture.afk,[{start:1,end:6,reason:"No input for 5 minutes"}]);
  const stats=analyze(capture,{start:0,end:5});assert.equal(stats.media[0].start,0);assert.equal(stats.media[0].end,4);
});
test("real app activity merges contiguous snapshots, preserves window changes and gaps, and thresholds idle", () => {
  const process = { instanceId:"42:1234", processId:42, name:"Editor.exe", executable:"C:\\Editor.exe" };
  const activity = { foreground:{process,windowId:"100",title:"Document"}, background:[process, {...process, instanceId:"43:2345",processId:43}],idleMs:300000 };
  const capture = recordedCapture(day,[row(1,10,{activity}),row(2,12,{intervalStartMs:epoch+10000,activity}),
    row(3,14,{intervalStartMs:epoch+12000,activity:{...activity,foreground:{...activity.foreground,title:"Other"},idleMs:0}}),row(4,30,{activity})],epoch+100000);
  assert.deepEqual(capture.activity.map(({start,end,windowTitle})=>({start,end,windowTitle})),[{start:10,end:14,windowTitle:"Document"},{start:14,end:16,windowTitle:"Other"},{start:30,end:32,windowTitle:"Document"}]);
  assert.equal(capture.apps.length,1);
  assert.deepEqual(capture.background.map(({start,end})=>({start,end})),[{start:10,end:16},{start:30,end:32}]);
  assert.deepEqual(capture.afk.map(({start,end})=>({start,end})),[{start:10,end:14},{start:30,end:32}]);
  assert.equal(capture.activity[0].contexts[0].kind,"window");
  assert.equal(capture.activity[0].contexts[0].end,14);
  const reused = recordedCapture(day,[row(1,10,{activity}),row(2,12,{intervalStartMs:epoch+10000,activity:{...activity,foreground:{...activity.foreground,process:{...process,instanceId:"42:9999"}}}})],epoch+100000);
  assert.equal(reused.activity.length,2,"a reused PID/window must not merge process instances");
});
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
