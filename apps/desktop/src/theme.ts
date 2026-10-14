export const defaultAccent = "#d4d4d8";
export const accentPresets = [
  { name: "Graphite", color: defaultAccent },
  { name: "Blue", color: "#93b4f5" },
  { name: "Violet", color: "#c4a7ee" },
  { name: "Amber", color: "#edc17b" },
  { name: "Teal", color: "#7dd3c9" },
];
export function validAccent(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}
export function accentForeground(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  const darkContrast = (luminance + .05) / (.009323 + .05);
  const lightContrast = (.955973 + .05) / (luminance + .05);
  return darkContrast >= lightContrast ? "#18181b" : "#fafafa";
}
