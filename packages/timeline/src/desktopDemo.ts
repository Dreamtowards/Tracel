import { createCapture } from "./data";
import { DAY, type Capture, type DataProvider, type MetricKey } from "./model";

/** Fabricated data, isolated from native collectors and persisted history. */
export function createDesktopDemoCapture(): Capture {
  const capture = createCapture();
  const gpu: MetricKey = "gpu:demo:usage";
  const engines: MetricKey[] = ["gpu:demo:3d", "gpu:demo:decode", "gpu:demo:encode", "gpu:demo:compute"];
  const dedicated: MetricKey = "gpu:demo:dedicated", shared: MetricKey = "gpu:demo:shared";
  capture.source = "Tracel · fabricated online demo";
  capture.initialView = { start: 6 * DAY + 9 * 3600, end: 6 * DAY + 11 * 3600 };
  capture.metricTracks = [
    { id: "cpuFrequency", name: "CPU frequency", keys: ["cpuFrequency"], subtitle: "GHz", after: "cpu" },
    { id: "demo-gpu", name: "AMD Radeon 780M", keys: [gpu], details: engines, subtitle: "GPU · expand for engines" },
    { id: "demo-vram", name: "GPU memory", keys: [dedicated, shared], subtitle: "AMD Radeon 780M" },
    { id: "battery", name: "Battery", keys: ["battery"], subtitle: "0 – 100%" },
    { id: "power", name: "Power status", keys: ["pluggedIn", "charging"], subtitle: "Plugged in / charging" },
  ];
  capture.metricOverrides = {
    [gpu]: { name: "GPU utilization", max: 100, unit: "%", color: "#d4ab72" },
    [dedicated]: { name: "Dedicated GPU memory", max: 4, unit: "GiB", color: "#5485df" },
    [shared]: { name: "Shared GPU memory", max: 4, unit: "GiB", color: "#ae9bdd" },
    ...Object.fromEntries(engines.map((key, index) => [key, { name: ["3D", "Video Decode", "Video Encode", "Compute"][index], max: 100, unit: "%", color: ["#d4ab72", "#83bc68", "#ae9bdd", "#54bdd6"][index] }])),
  };
  for (const sample of capture.metrics) {
    if (!sample.values) continue;
    const values = sample.values;
    const hour = sample.time % DAY / 3600;
    const wave = (Math.sin(sample.time / 190) + 1) / 2;
    const busy = (values.cpu ?? 0) / 100;
    const plugged = hour >= 10 && hour < 18;
    values[gpu] = values.gpu ?? 0;
    delete values.gpu;
    values[engines[0]] = values[gpu] * .85;
    values[engines[1]] = hour >= 13 && hour < 14 ? 18 + wave * 14 : 0;
    values[engines[2]] = hour >= 16 && hour < 16.5 ? 30 + wave * 20 : 0;
    values[engines[3]] = busy > .5 ? busy * 45 : wave * 3;
    values[gpu] = Math.max(...engines.map(key => values[key] ?? 0));
    values[dedicated] = .35 + (values[gpu] / 100) * 2;
    values[shared] = .15 + busy * .65;
    values.cpuFrequency = 1.6 + busy * 2.8;
    values.battery = hour < 10 ? 86 - hour * 3 : hour < 18 ? Math.min(100, 56 + (hour - 10) * 10) : 100 - (hour - 18) * 6;
    values.pluggedIn = plugged ? 1 : 0;
    values.charging = plugged && values.battery < 100 ? 1 : 0;
    values.audioInput = hour >= 10.3 && hour < 10.8 ? 12 + wave * 55 : 0;
  }
  return capture;
}
let cached: Capture | undefined;
export const desktopDemoProvider: DataProvider = {
  async load() { return cached ??= createDesktopDemoCapture(); },
};
