export const themePalettes = {
  blue: {
    label: "Blue",
    live: "#69adf5",
    selected: "#a1cfff",
    dim: "#355d84",
    info: "#91a5ba",
    heat: "#31577e",
    bright: "#92c7ff",
  },
  cyan: {
    label: "Cyan",
    live: "#56bed0",
    selected: "#a0e6ef",
    dim: "#316571",
    info: "#90aab7",
    heat: "#2d6470",
    bright: "#9ae3ed",
  },
  violet: {
    label: "Violet",
    live: "#a594e8",
    selected: "#d4c7ff",
    dim: "#554875",
    info: "#a6a0b6",
    heat: "#554874",
    bright: "#d0c1fa",
  },
} as const;
export type ThemeColor = keyof typeof themePalettes;
