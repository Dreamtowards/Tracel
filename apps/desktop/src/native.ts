import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { RangeExport } from "@tracel/timeline";

export const nativeClient = isTauri();

export type AppInfo = { version: string; platform: string; deviceName: string };

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

export type CollectionSettings = { enabled: boolean; cpu: boolean; ram: boolean; network: boolean; disk: boolean; audio: boolean; media: boolean };
export type SystemObservation = { capturedAtMs: number; cpuPercent: number | null; memoryUsedBytes: number | null; memoryTotalBytes: number | null; networkReceiveBytesPerSecond: number | null; networkSendBytesPerSecond: number | null; diskReadBytesPerSecond: number | null; diskWriteBytesPerSecond: number | null; audioPeakPercent: number | null; media: { title: string; artist: string; application: string; playbackStatus: string } | null; errors: string[] };
export type CollectionStatus = {
  settings: CollectionSettings; supported: boolean; periodMs: number; sampleCount: number;
  latest: SystemObservation | null; keepAwakeRequested: boolean; keepAwakeActive: boolean;
  powerError: string | null; startupWarning: string | null;
};
export type ForegroundInfo = { capturedAtMs: number; windowId: string; processId: number; title: string; executable: string | null; url: string | null; notes: string[] };
export const getCollectionStatus = () => invoke<CollectionStatus>("collection_status");
export const setCollectionSettings = (settings: CollectionSettings) => invoke<CollectionStatus>("set_collection_settings", { settings });
export const getSystemHistory = () => invoke<SystemObservation[]>("system_history");
export const setKeepAwake = (enabled: boolean) => invoke<CollectionStatus>("set_keep_awake", { enabled });
export const inspectForeground = () => invoke<ForegroundInfo>("inspect_foreground");

export async function saveRange(payload: RangeExport, title = "Export timeline range"): Promise<"saved" | "cancelled"> {
  const path = await save({
    title,
    defaultPath: "tracel-selection.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return "cancelled";
  await writeTextFile(path, JSON.stringify(payload, null, 2));
  return "saved";
}

export type FileUsage = { path: string; checkedAtMs: number; modifiedAtMs: number | null; processes: { processId: number; startedAtTicks: string; name: string; service: string; executable: string | null }[] };
export const inspectFileUsers = (path: string) => invoke<FileUsage>("inspect_file_usage", { path });

export type DisplayTimeout = { schemeId: string; acSeconds: number; dcSeconds: number };
export const readDisplayTimeout = () => invoke<DisplayTimeout>("read_display_timeout");
export const setDisplayTimeout = (expected: DisplayTimeout, acSeconds: number, dcSeconds: number) => invoke<DisplayTimeout>("set_display_timeout", { expected, acSeconds, dcSeconds });
