export function time(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour12: false,
  });
}
export function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
export function elapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
export function coordinate(value: number, latitude: boolean) {
  return `${Math.abs(value).toFixed(4)}° ${latitude ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E"}`;
}

export function firstSeenAgo(timestamp: number, now: number) {
  const seconds = Math.max(0, (now - timestamp) / 1000);
  const relative = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  if (seconds >= 86400) return relative.format(-Math.floor(seconds / 86400), "day");
  if (seconds >= 3600) return relative.format(-Math.floor(seconds / 3600), "hour");
  if (seconds >= 60) return relative.format(-Math.floor(seconds / 60), "minute");
  return "Just now";
}
export function localDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
export function totalDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours
    ? `${hours}h ${minutes}m`
    : minutes
      ? `${minutes}m ${seconds % 60}s`
      : `${seconds}s`;
}
export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
