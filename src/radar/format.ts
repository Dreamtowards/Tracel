export function time(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    timeZone: "UTC",
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
