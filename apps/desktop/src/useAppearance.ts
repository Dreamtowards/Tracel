import { useEffect, useState } from "react";

export const zoomLevels = [75, 90, 100, 110, 125, 150, 175] as const;
const defaultZoom = 110;
const storageKey = "tracel.desktop.appearance";
type Appearance = { zoom: number; expanded: boolean };

function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return {
      zoom: zoomLevels.includes(saved?.zoom) ? saved.zoom : defaultZoom,
      expanded: typeof saved?.expanded === "boolean" ? saved.expanded : false,
    };
  } catch { return { zoom: defaultZoom, expanded: false }; }
}

export function useAppearance() {
  const [appearance, setAppearance] = useState(loadAppearance);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(appearance)); }
    catch { /* The controls still work when local storage is unavailable. */ }
  }, [appearance]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      const direction = ["+", "="].includes(event.key) || event.code === "NumpadAdd" ? 1
        : event.key === "-" || event.code === "NumpadSubtract" ? -1
          : event.key === "0" || event.code === "Numpad0" ? 0 : null;
      if (direction === null) return;
      event.preventDefault();
      event.stopPropagation();
      setAppearance((current) => ({ ...current, zoom: direction === 0 ? defaultZoom
        : direction > 0 ? zoomLevels.find((level) => level > current.zoom) ?? zoomLevels.at(-1)!
          : [...zoomLevels].reverse().find((level) => level < current.zoom) ?? zoomLevels[0] }));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return {
    ...appearance,
    setZoom: (zoom: number) => {
      if (zoomLevels.some((level) => level === zoom)) setAppearance((current) => ({ ...current, zoom }));
    },
    toggleNavigation: () => setAppearance((current) => ({ ...current, expanded: !current.expanded })),
  };
}
