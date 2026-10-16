import { createContext, useContext, type ReactNode } from "react";
import type { DisplayTimeout, EnvironmentReport, FileUsage, ForegroundInfo, UpdatePolicy } from "./platformTypes";

/** Platform operations are injected by the host; shared pages never import Tauri. */
export type PlatformServices = {
  nativeClient: boolean;
  chooseFile: (title: string) => Promise<string | null>;
  inspectFileUsers: (path: string) => Promise<FileUsage>;
  readDisplayTimeout: () => Promise<DisplayTimeout>;
  setDisplayTimeout: (expected: DisplayTimeout, ac: number, dc: number) => Promise<DisplayTimeout>;
  inspectEnvironment: () => Promise<EnvironmentReport>;
  updatePolicy: (action: "read" | "disable" | "restore") => Promise<UpdatePolicy>;
  openSystemShortcut: (target: string) => Promise<void>;
  openCategoryFolder: () => Promise<void>;
  inspectForeground: () => Promise<ForegroundInfo>;
  openDatabaseFolder: () => Promise<void>;
  openSoundSettings: () => Promise<void>;
  exportSystemMetrics: (title: string) => Promise<number | null>;
};
const unsupported = async (): Promise<never> => { throw new Error("This operation requires the Windows client."); };
export const browserPlatform: PlatformServices = Object.freeze({
  nativeClient: false, chooseFile: unsupported, inspectFileUsers: unsupported,
  readDisplayTimeout: unsupported, setDisplayTimeout: unsupported,
  inspectEnvironment: unsupported, updatePolicy: unsupported, openSystemShortcut: unsupported,
  openCategoryFolder: unsupported, inspectForeground: unsupported,
  openDatabaseFolder: unsupported, openSoundSettings: unsupported, exportSystemMetrics: unsupported,
});
const PlatformContext = createContext<PlatformServices>(browserPlatform);
export function PlatformProvider({ value, children }: { value: PlatformServices; children: ReactNode }) {
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}
export const usePlatform = () => useContext(PlatformContext);
