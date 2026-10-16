/** Plain data contracts: no Tauri or platform calls. */
export type EnvironmentReport = { entries: { kind: string; version: string; path: string; source: string }[]; warnings: string[] };
export type UpdatePolicy = { edition: string; supported: boolean; administrator: boolean; disabled: boolean; owned: boolean; since: string | null };
export type AppInfo = { version: string; platform: string; deviceName: string };
export type CollectionSettings = { enabled: boolean; cpuFrequency?: boolean; gpu?: boolean; battery?: boolean; cpu: boolean; ram: boolean; network: boolean; disk: boolean; audio: boolean; audioInput?: boolean; media: boolean; foreground?: boolean; background?: boolean; idle?: boolean };
export type ObservedProcess = { instanceId: string; processId: number; name: string; executable: string | null };
export type ObservedActivity = { foreground: { process: ObservedProcess; windowId: string; title: string } | null; background: ObservedProcess[] | null; idleMs: number | null };
export type GpuObservation = { id: string; name: string; utilizationPercent: number | null; engines: { id: string; name: string; utilizationPercent: number }[]; dedicatedUsedBytes: number | null; sharedUsedBytes: number | null };
export type BatteryObservation = { present: boolean | null; percent: number | null; pluggedIn: boolean | null; charging: boolean | null };
export type SystemObservation = { capturedAtMs: number; intervalStartMs: number | null; cpuPercent: number | null; cpuFrequencyMhz?: number | null; gpus?: GpuObservation[] | null; battery?: BatteryObservation | null; memoryUsedBytes: number | null; memoryTotalBytes: number | null; networkReceiveBytesPerSecond: number | null; networkSendBytesPerSecond: number | null; diskReadBytesPerSecond: number | null; diskWriteBytesPerSecond: number | null; audioPeakPercent: number | null; audioInputPeakPercent?: number | null; media: { title: string; artist: string; application: string; playbackStatus: string } | null; activity?: ObservedActivity | null; errors: string[] };
export type CollectionStatus = {
  settings: CollectionSettings; supported: boolean; periodMs: number; sampleCount: number;
  latest: SystemObservation | null; keepAwakeRequested: boolean; keepAwakeActive: boolean;
  powerError: string | null; startupWarning: string | null;
  storageError: string | null; persistedCount: number;
  databasePath: string;
  databaseSizeBytes?: number | null;
};
export type StoredObservation = { id: number; sample: SystemObservation };
export type StateInterval<T> = { id: number; startMs: number; endMs: number; value: T };
export type StateIntervals = {
  apps: StateInterval<ObservedProcess>[];
  foreground: StateInterval<NonNullable<ObservedActivity["foreground"]>>[];
  media: StateInterval<NonNullable<SystemObservation["media"]>>[];
  idle: StateInterval<null>[];
};
export type ArchivePage = { observations: StoredObservation[]; nextCursor: number; firstAtMs: number | null; lastAtMs: number | null; intervals?: StateIntervals };
export type ForegroundInfo = { capturedAtMs: number; windowId: string; processId: number; title: string; executable: string | null; url: string | null; notes: string[] };
export type FileUsage = { path: string; checkedAtMs: number; modifiedAtMs: number | null; processes: { processId: number; startedAtTicks: string; name: string; service: string; executable: string | null }[] };
export type DisplayTimeout = { schemeId: string; acSeconds: number; dcSeconds: number };
export type AudioDevice = { id: string; name: string; direction: "input" | "output"; defaultRoles: string[] };
export type AudioSession = { id: string; deviceId: string; processId: number; name: string; executable: string | null; systemSounds: boolean; multiProcess: boolean; state: string; peakPercent: number | null; volumePercent: number | null; muted: boolean | null; lastHeardAtMs: number | null; heldPeakPercent: number };
export type AudioSnapshot = { monitoring: boolean; capturedAtMs: number; devices: AudioDevice[]; sessions: AudioSession[]; errors: string[] };
export type MediaSessions = { sessions: NonNullable<SystemObservation["media"]>[]; errors: string[] };

export type AudioMonitorController = { status: AudioSnapshot | null; busy: boolean; error: string; change: (enabled: boolean) => Promise<void> };
export type MediaController = { snapshot: MediaSessions | null; loading: boolean; error: string };
