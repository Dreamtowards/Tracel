import type { Capture, MetricKey, MetricSample, MediaInterval } from "@tracel/timeline/model";
import { gpuDisplayNames, gpuIdentity, isGpuFallbackName, type GpuDisplayOptions } from "./gpuNames";
import type { StoredObservation, ObservedProcess, StateIntervals } from "./native";
import { inheritMetricIndex } from "@tracel/timeline/metric-index";

const metricOwners = new WeakMap<MetricSample, StoredObservation>();

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dayRange(value: string) {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}
const emptyValues = (): Partial<Record<MetricKey, number | null>> => ({ cpu: null, ram: null, gpu: null, download: null, upload: null, read: null, write: null, audio: null });

/** Native-to-UI boundary: UTC milliseconds to epoch-relative seconds; no simulated activity. */
export function recordedCapture(day: string, rows: StoredObservation[], now = Date.now(), intervals?: StateIntervals, gpuOptions: GpuDisplayOptions = {}, resolvedGpuNames?: ReadonlyMap<string, string>): Capture {
  const { startMs, endMs } = dayRange(day);
  const bounds = { start: 0, end: (endMs - startMs) / 1000 };
  const samples = [...rows].sort((a, b) => a.sample.capturedAtMs - b.sample.capturedAtMs || a.id - b.id);
  const metricOverrides: NonNullable<Capture["metricOverrides"]> = {};
  const metricTracks: NonNullable<Capture["metricTracks"]> = [];
  const gpuNames = resolvedGpuNames ?? gpuDisplayNames(samples.map(({sample}) => sample), gpuOptions);
  const visibleGpus = (sample: StoredObservation["sample"]) => (sample.gpus ?? []).filter(gpu => gpuNames.has(gpuIdentity(gpu.id)));
  const gpus = new Map<string, { name: string; engines: Map<string,string> }>();
  for (const { sample } of samples) for (const gpu of visibleGpus(sample)) {
    const device = gpus.get(gpuIdentity(gpu.id)) ?? { name: gpuNames.get(gpuIdentity(gpu.id))!, engines: new Map<string,string>() };
    for (const engine of gpu.engines) device.engines.set(engine.id,engine.name);
    gpus.set(gpuIdentity(gpu.id),device);
  }
  const gpuKey = (id: string, field: string): MetricKey => `gpu:${gpuIdentity(id)}:${field}`;
  const engineColors = ["#54bdd6", "#ae9bdd", "#83bc68", "#d783c3", "#5485df", "#d4ab72"];
  const hasFrequency = samples.some(({sample}) => sample.cpuFrequencyMhz != null);
  const hasBattery = samples.some(({sample}) => sample.battery?.present === true);
  const hasPower = samples.some(({sample}) => sample.battery?.pluggedIn != null);
  if (hasFrequency) metricTracks.push({ id: "cpuFrequency", name: "CPU frequency", keys: ["cpuFrequency"], subtitle: "Windows-reported · GHz", after: "cpu" });
  for (const [id, device] of gpus) {
    const total = gpuKey(id,"total"), dedicated = gpuKey(id,"dedicated"), shared = gpuKey(id,"shared");
    const engines = [...device.engines].sort(([a],[b]) => a.localeCompare(b,undefined,{numeric:true}));
    metricOverrides[total] = { name: "GPU utilization", color: "#d4ab72", max: 100, unit: "%" };
    const details = engines.map(([engine,name],index) => {
      const key = gpuKey(id,`engine:${engine}`);
      metricOverrides[key] = { name, color: engineColors[index % engineColors.length], max: 100, unit: "%" };
      return key;
    });
    metricOverrides[dedicated] = { name: "Dedicated GPU memory", color: "#5485df", unit: "GiB", max: 1 };
    metricOverrides[shared] = { name: "Shared GPU memory", color: "#ae9bdd", unit: "GiB", max: 1 };
    metricTracks.push({ id: `adapter:${id}`, name: device.name, keys: [total], details, subtitle: "GPU · expand for engines" },
      { id: `memory:${id}`, name: "GPU memory", keys: [dedicated,shared], subtitle: device.name });
  }
  if (hasBattery) metricTracks.push({ id: "battery", name: "Battery", keys: ["battery"], subtitle: "0 – 100%" });
  if (hasPower) metricTracks.push({ id: "power", name: "Power status", keys: hasBattery ? ["pluggedIn","charging"] : ["pluggedIn"], subtitle: "Plugged in / charging" });
  const metrics: MetricSample[] = [], media: MediaInterval[] = [], apps: Capture["apps"] = [];
  const appIds = new Set<string>();
  const activity: Capture["activity"] = [], background: Capture["background"] = [], afk: Capture["afk"] = [];
  const lastBackground = new Map<string, Capture["background"][number]>();
  const application = (process: ObservedProcess) => {
    const id = `app:${process.executable?.toLowerCase() ?? process.instanceId}`;
    if (!appIds.has(id)) {
      appIds.add(id);
      const palette = ["#879bb7", "#a49cbe", "#b5a483", "#83a9ad", "#b591a2"];
      const hash = Array.from(id).reduce((value, letter) => (value * 31 + letter.charCodeAt(0)) >>> 0, 0);
      apps.push({ id, name: process.name, exe: process.executable?.split(/[\\/]/).at(-1) ?? "", executablePath: process.executable ?? undefined, color: palette[hash % palette.length], glyph: process.name.slice(0,1).toUpperCase() });
    }
    return id;
  };
  const seconds = (ms: number) => (ms - startMs) / 1000;
  let metricOwner: StoredObservation;
  const add = (start: number, end: number, values: MetricSample["values"]) => {
    start = Math.max(bounds.start, start); end = Math.min(bounds.end, end);
    if (start < end && values && Object.values(values).some((value) => value != null)) {
      const metric: MetricSample = { time: start, end, subject: { kind: "system", id: "system" }, values };
      metrics.push(metric); metricOwners.set(metric, metricOwner);
    }
  };
  for (let i = 0; i < samples.length; i++) {
    metricOwner = samples[i];
    const sample = samples[i].sample, next = samples[i + 1]?.sample;
    const time = seconds(sample.capturedAtMs);
    const interval = sample.intervalStartMs;
    // CPU and throughput readings summarize the preceding measured interval.
    if (interval != null && interval < sample.capturedAtMs && sample.capturedAtMs - interval <= 6000) {
      const gpuValues: Partial<Record<MetricKey, number | null>> = {};
      for (const gpu of visibleGpus(sample)) {
        gpuValues[gpuKey(gpu.id,"total")] = gpu.utilizationPercent;
        for (const engine of gpu.engines) gpuValues[gpuKey(gpu.id,`engine:${engine.id}`)] = engine.utilizationPercent;
      }
      // Overall summary uses the busiest observed adapter, never a sum of percentages.
      const totals = visibleGpus(sample).map((gpu) => gpu.utilizationPercent).filter((value): value is number => value != null);
      add(seconds(interval), time, { ...emptyValues(), ...gpuValues, gpu: totals.length ? Math.max(...totals) : null, cpu: sample.cpuPercent,
        download: sample.networkReceiveBytesPerSecond == null ? null : sample.networkReceiveBytesPerSecond / 1024 ** 2,
        upload: sample.networkSendBytesPerSecond == null ? null : sample.networkSendBytesPerSecond / 1024 ** 2,
        read: sample.diskReadBytesPerSecond == null ? null : sample.diskReadBytesPerSecond / 1024 ** 2,
        write: sample.diskWriteBytesPerSecond == null ? null : sample.diskWriteBytesPerSecond / 1024 ** 2 });
    }
    // Gauges/media are sample-and-hold estimates, capped at 2s when continuity is unknown.
    const continuous = next?.intervalStartMs === sample.capturedAtMs && next.capturedAtMs - sample.capturedAtMs <= 6000;
    const end = Math.min(bounds.end, seconds(continuous ? next.capturedAtMs : sample.capturedAtMs + 2000), next ? seconds(next.capturedAtMs) : Infinity, seconds(now));
    const hardwareValues: Partial<Record<MetricKey, number | null>> = {
      cpuFrequency: sample.cpuFrequencyMhz == null ? null : sample.cpuFrequencyMhz / 1000,
      battery: sample.battery?.percent ?? null,
      pluggedIn: sample.battery?.pluggedIn == null ? null : Number(sample.battery.pluggedIn),
      charging: sample.battery?.charging == null ? null : Number(sample.battery.charging),
    };
    for (const gpu of visibleGpus(sample)) {
      hardwareValues[gpuKey(gpu.id,"dedicated")] = gpu.dedicatedUsedBytes == null ? null : gpu.dedicatedUsedBytes / 1024 ** 3;
      hardwareValues[gpuKey(gpu.id,"shared")] = gpu.sharedUsedBytes == null ? null : gpu.sharedUsedBytes / 1024 ** 3;
    }
    add(time, end, { ...emptyValues(), ...hardwareValues, ram: sample.memoryUsedBytes == null ? null : sample.memoryUsedBytes / 1024 ** 3, audioInput: sample.audioInputPeakPercent ?? null, audio: sample.audioPeakPercent });
    const start = Math.max(0, time), observed = sample.activity;
    if (observed && start < end) {
      const window = observed.foreground;
      if (window) {
        const appId = application(window.process), previous = activity.at(-1);
        if (previous && previous.end === start && previous.appId === appId && previous.windowTitle === window.title && previous.windowId === window.windowId && previous.processInstanceId === window.process.instanceId) {
          previous.end = end; previous.contexts.forEach((context) => { context.end = end; });
        } else activity.push({ id: `native-${samples[i].id}`, start, end, appId, windowTitle: window.title, windowId: window.windowId, processInstanceId: window.process.instanceId,
          contexts: window.title ? [{ start, end, kind: "window", title: window.title, value: window.title }] : [] });
      }
      for (const appId of new Set((observed.background ?? []).map(application))) {
        const previous = lastBackground.get(appId);
        if (previous?.end === start) previous.end = end;
        else { const lifetime = { start, end, appId }; background.push(lifetime); lastBackground.set(appId,lifetime); }
      }
      if (observed.idleMs != null && observed.idleMs >= 300000) {
        const previous = afk.at(-1);
        if (previous?.end === start) previous.end = end;
        else afk.push({ start, end, reason: "No input for 5 minutes" });
      }
    }
    const m = sample.media;
    if (m && (m.playbackStatus === "Playing" || m.playbackStatus === "Paused") && time < bounds.end && end > Math.max(0,time)) {
      if (!appIds.has(m.application)) {
        appIds.add(m.application); apps.push({ id: m.application, name: m.application, exe: "", color: "#9b9db2", glyph: "♫" });
      }
      const previous = media.at(-1);
      const state = m.playbackStatus === "Playing" ? "playing" : "paused";
      const start = Math.max(0,time);
      if (previous && Math.abs(previous.end - start) < 0.001 && previous.appId === m.application && previous.title === m.title && previous.artist === m.artist && previous.state === state) previous.end = end;
      else media.push({ start, end, appId: m.application, title: m.title, artist: m.artist, state });
    }
  }
  if (intervals) {
    // Numeric samples and compact state intervals have independent query paths.
    // Keep the snapshot adapter for preview fixtures and the small in-memory history only.
    activity.length = 0; background.length = 0; media.length = 0; afk.length = 0;
    const clip = (interval: { startMs: number; endMs: number }) => ({ start: Math.max(0, seconds(interval.startMs)), end: Math.min(bounds.end, seconds(interval.endMs), seconds(now)) });
    for (const interval of intervals.foreground) {
      const range = clip(interval); if (range.start >= range.end) continue;
      const window = interval.value, appId = application(window.process);
      activity.push({ ...range, id: `interval-${interval.id}`, appId, windowTitle: window.title, windowId: window.windowId, processInstanceId: window.process.instanceId,
        contexts: window.title ? [{ ...range, kind: "window", title: window.title, value: window.title }] : [] });
    }
    // Union overlapping process-instance ranges for the same application, without bridging gaps.
    const presence = intervals.apps.map((interval) => ({ ...clip(interval), appId: application(interval.value) }))
      .filter((interval) => interval.start < interval.end).sort((a,b) => a.appId.localeCompare(b.appId) || a.start-b.start);
    for (const interval of presence) {
      const previous = background.at(-1);
      if (previous?.appId === interval.appId && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
      else background.push(interval);
    }
    for (const interval of intervals.media) {
      const range = clip(interval), item = interval.value;
      if (range.start >= range.end || !["Playing", "Paused"].includes(item.playbackStatus)) continue;
      if (!appIds.has(item.application)) { appIds.add(item.application); apps.push({ id: item.application, name: item.application, exe: "", color: "#9b9db2", glyph: "♫" }); }
      media.push({ ...range, appId: item.application, title: item.title, artist: item.artist, state: item.playbackStatus === "Playing" ? "playing" : "paused" });
    }
    for (const interval of intervals.idle) { const range = clip(interval); if (range.start < range.end) afk.push({ ...range, reason: "No input for 5 minutes" }); }
  }
  metrics.sort((a,b) => a.time - b.time);
  const memoryMax = samples.reduce((maximum,{sample}) => Math.max(maximum,(sample.memoryTotalBytes ?? 0) / 1024 ** 3),1);
  const maxRate = (keys: MetricKey[], baseline: number) => metrics.reduce((maximum,sample) => keys.reduce((max,key) => Math.max(max,sample.values?.[key] ?? 0),maximum),baseline);
  const rateMax = maxRate(["download", "upload"],32), diskMax = maxRate(["read", "write"],160);
  for (const [id] of gpus) {
    const keys = [gpuKey(id,"dedicated"),gpuKey(id,"shared")];
    const max = maxRate(keys,1);
    keys.forEach((key) => { metricOverrides[key] = { ...metricOverrides[key], max }; });
  }
  if (hasFrequency) metricOverrides.cpuFrequency = { max: maxRate(["cpuFrequency"],6) };
  const latest = Math.min(bounds.end, Math.max(3600, seconds(samples.at(-1)?.sample.capturedAtMs ?? Math.min(endMs, now)) + 120));
  return { kind: "recorded", source: "Tracel recorded system metrics", epoch: new Date(startMs).toISOString(), bounds,
    initialView: { start: Math.max(0, latest - 3600), end: latest }, samplePeriod: 2, maxSampleSpan: 6,
    metricTracks, metricOverrides: { ...metricOverrides, ram: { max: memoryMax, unit: "GiB" }, download: { max: rateMax, unit: "MiB/s" }, upload: { max: rateMax, unit: "MiB/s" }, read: { max: diskMax, unit: "MiB/s" }, write: { max: diskMax, unit: "MiB/s" } },
    apps, activity, background, afk, metrics, media, events: [] };
}

function hardwareInventory(rows: StoredObservation[]) {
  const result = new Set<string>();
  for (const { sample } of rows) {
    if (sample.cpuFrequencyMhz != null) result.add("frequency");
    if (sample.battery?.present === true) result.add("battery");
    if (sample.battery?.pluggedIn != null) result.add("power");
    for (const gpu of sample.gpus ?? []) {
      result.add(JSON.stringify([gpuIdentity(gpu.id), gpu.name]));
      for (const engine of gpu.engines) result.add(JSON.stringify([gpuIdentity(gpu.id), engine.id, engine.name]));
    }
  }
  return result;
}

/** Per-view builder: snapshots remain immutable, only the previous numeric tail is replaced. */
export function createRecordedCaptureBuilder() {
  let prior: { day: string; rows: StoredObservation[]; now: number; intervals?: StateIntervals;
    options: string; capture: Capture; inventory: Set<string>; supported: boolean;
    names: Map<string, string>; engines: Map<string, string> } | undefined;
  return (day: string, rows: StoredObservation[], now: number, intervals?: StateIntervals, options: GpuDisplayOptions = {}): Capture => {
    const optionKey = JSON.stringify([options.simplifyGpuNames !== false, options.showSoftwareGpus === true]);
    if (prior?.day === day && prior.rows === rows && prior.now === now && prior.intervals === intervals && prior.options === optionKey) return prior.capture;
    const previous = prior;
    const added = previous ? rows.slice(previous.rows.length) : [];
    const ordered = (items: StoredObservation[], before?: StoredObservation) => items.every(row => {
      const valid = !before || row.sample.capturedAtMs > before.sample.capturedAtMs;
      before = row; return valid;
    });
    const inventory = hardwareInventory(added);
    const incremental = previous && previous.supported && intervals && previous.day === day && previous.options === optionKey
      && now >= previous.now && previous.now >= previous.rows.at(-1)!.sample.capturedAtMs
      && rows.length >= previous.rows.length && previous.rows.every((row, i) => row === rows[i])
      && ordered(added, previous.rows.at(-1)) && added.every(row => !row.sample.activity && !row.sample.media)
      && [...inventory].every(item => previous.inventory.has(item))
      && added.every(({ sample }) => (sample.gpus ?? []).every(gpu =>
        (isGpuFallbackName(gpu.name) || gpu.name.trim() === previous.names.get(gpuIdentity(gpu.id)))
        && gpu.engines.every(engine => previous.engines.get(JSON.stringify([gpuIdentity(gpu.id), engine.id])) === engine.name)));
    let capture: Capture;
    if (incremental) {
      const last = previous.rows.at(-1)!;
      const names = new Map((previous.capture.metricTracks ?? []).filter(track => track.id.startsWith("adapter:"))
        .map(track => [track.id.slice("adapter:".length), track.name]));
      const tail = recordedCapture(day, [last, ...added], now, intervals, options, names);
      const removed = new Set(previous.capture.metrics.filter(sample => metricOwners.get(sample) === last));
      const retained = previous.capture.metrics.filter(sample => !removed.has(sample));
      const metrics: MetricSample[] = [];
      let left = 0, right = 0;
      // Stable merge retains the original order of equal-time rate/gauge samples.
      while (left < retained.length || right < tail.metrics.length) {
        if (right >= tail.metrics.length || (left < retained.length && retained[left].time <= tail.metrics[right].time)) metrics.push(retained[left++]);
        else metrics.push(tail.metrics[right++]);
      }
      const overrides = { ...previous.capture.metricOverrides };
      for (const [key, info] of Object.entries(tail.metricOverrides ?? {})) {
        const metric = key as MetricKey;
        if (overrides[metric] && info?.max != null) overrides[metric] = { ...overrides[metric], max: Math.max(overrides[metric]!.max ?? 0, info.max) };
      }
      capture = { ...tail, metrics, metricTracks: previous.capture.metricTracks, metricOverrides: overrides };
      inheritMetricIndex(previous.capture, capture, removed, tail.metrics);
    } else capture = recordedCapture(day, rows, now, intervals, options);
    const engines = incremental ? previous.engines : new Map<string, string>();
    if (!incremental) for (const { sample } of rows) for (const gpu of sample.gpus ?? [])
      for (const engine of gpu.engines) engines.set(JSON.stringify([gpuIdentity(gpu.id), engine.id]), engine.name);
    prior = { day, rows, now, intervals, options: optionKey, capture, engines,
      names: incremental ? previous.names : gpuDisplayNames(rows.map(row => row.sample), { simplifyGpuNames: false, showSoftwareGpus: true }),
      inventory: incremental ? previous.inventory : hardwareInventory(rows),
      supported: !!intervals && rows.length > 0 && rows.every(row => !row.sample.activity && !row.sample.media) && ordered(rows) };
    return capture;
  };
}
