import type { EnvironmentReport, UpdatePolicy, AppInfo, CollectionSettings, ObservedProcess, ObservedActivity, GpuObservation, BatteryObservation, SystemObservation, CollectionStatus, StoredObservation, StateInterval, StateIntervals, ArchivePage, ForegroundInfo, FileUsage, DisplayTimeout, AudioDevice, AudioSession, AudioSnapshot, MediaSessions } from "@tracel/timeline/desktop/platformTypes";
export type { EnvironmentReport, UpdatePolicy, AppInfo, CollectionSettings, ObservedProcess, ObservedActivity, GpuObservation, BatteryObservation, SystemObservation, CollectionStatus, StoredObservation, StateInterval, StateIntervals, ArchivePage, ForegroundInfo, FileUsage, DisplayTimeout, AudioDevice, AudioSession, AudioSnapshot, MediaSessions } from "@tracel/timeline/desktop/platformTypes";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { RangeExport } from "@tracel/timeline";

export const nativeClient = isTauri();
export const openCategoryFolder = () => invoke<void>("open_category_folder");

export const inspectEnvironment = () => invoke<EnvironmentReport>("developer_environment");
export const updatePolicy = (action: "read" | "disable" | "restore") => invoke<UpdatePolicy>("windows_update_policy", { action });
export const openSystemShortcut = (target: string) => invoke<void>("open_system_shortcut", { target });

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

export const queryTimeline = (query: { startMs: number; endMs: number; afterId: number }) => invoke<ArchivePage>("timeline_observations", query);

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

export const inspectFileUsers = (path: string) => invoke<FileUsage>("inspect_file_usage", { path });

export const readDisplayTimeout = () => invoke<DisplayTimeout>("read_display_timeout");
export const setDisplayTimeout = (expected: DisplayTimeout, acSeconds: number, dcSeconds: number) => invoke<DisplayTimeout>("set_display_timeout", { expected, acSeconds, dcSeconds });

export const getAudioStatus = () => invoke<AudioSnapshot>("audio_status");
export const setAudioMonitor = (enabled: boolean) => invoke<AudioSnapshot>("set_audio_monitor", { enabled });
export const openSoundSettings = () => invoke<void>("open_sound_settings");
export const openDatabaseFolder = () => invoke<void>("open_database_folder");

export const getMediaSessions = () => invoke<MediaSessions>("media_sessions");
