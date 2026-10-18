export const trackSources = ["foreground", "background", "idle", "cpu", "cpuFrequency", "ram", "gpu", "network", "disk", "battery", "audioInput", "audio", "media"] as const;
export type TrackSource = typeof trackSources[number];

export function normalizeHiddenSources(value: unknown): TrackSource[] {
  return Array.isArray(value) ? trackSources.filter(source => value.includes(source)) : [];
}

const groups: Record<string, readonly TrackSource[]> = {
  activity: ["foreground", "background", "idle"],
  performance: ["cpu", "cpuFrequency", "ram", "gpu", "network", "disk", "battery"],
  sound: ["audioInput", "audio", "media"],
};
export function isTrackHidden(id: string, hidden: readonly TrackSource[]) {
  if (groups[id]) return groups[id].every(source => hidden.includes(source));
  const source: TrackSource | undefined = id === "context" || id === "foreground" ? "foreground"
    : id === "background" || id.startsWith("bg-") ? "background"
    : id === "afk" ? "idle"
    : id === "network" ? "network" : id === "disk" ? "disk"
    : id === "gpu" || id.startsWith("adapter:") || id.startsWith("memory:") ? "gpu"
    : id === "power" ? "battery"
    : trackSources.find(source => source === id);
  return source != null && hidden.includes(source);
}
