import { open, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { PlatformServices } from "@tracel/timeline/desktop/platform";
import * as native from "./native";

/** Only the Desktop host knows how these capabilities reach Windows. */
export const desktopPlatform: PlatformServices = {
  nativeClient: native.nativeClient,
  inspectFileUsers: native.inspectFileUsers,
  readDisplayTimeout: native.readDisplayTimeout,
  setDisplayTimeout: native.setDisplayTimeout,
  inspectEnvironment: native.inspectEnvironment,
  updatePolicy: native.updatePolicy,
  openSystemShortcut: native.openSystemShortcut,
  openCategoryFolder: native.openCategoryFolder,
  inspectForeground: native.inspectForeground,
  openDatabaseFolder: native.openDatabaseFolder,
  openSoundSettings: native.openSoundSettings,
  async chooseFile(title) { return await open({ title, directory: false, multiple: false }); },
  async exportSystemMetrics(title) {
    const samples = await native.getSystemHistory();
    const path = await save({ title, defaultPath: "tracel-system-metrics.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return null;
    await writeTextFile(path, JSON.stringify({ source: "Tracel native system metrics", timestampUnit: "UTC Unix milliseconds", cpuUnit: "percent", memoryUnit: "bytes", networkUnit: "bytes per second", diskUnit: "bytes per second", audioUnit: "percent peak amplitude", audioInputUnit: "percent input peak amplitude", gpuUnit: "percent per engine; overall busiest engine", gpuMemoryUnit: "bytes", cpuFrequencyUnit: "Windows-reported MHz", batteryUnit: "percent; nullable power state booleans", mediaSource: "Windows SMTC", nominalPeriodMs: 2000, samples }, null, 2));
    return samples.length;
  },
};
