import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { RangeExport } from "@tracel/timeline";

export const nativeClient = isTauri();

export type AppInfo = { version: string; platform: string; deviceName: string };

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("app_info");
}

export async function saveRange(payload: RangeExport): Promise<"saved" | "cancelled"> {
  const path = await save({
    title: "Export timeline range",
    defaultPath: "tracel-selection.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return "cancelled";
  await writeTextFile(path, JSON.stringify(payload, null, 2));
  return "saved";
}
