import type { Locale } from "@tracel/timeline";
import { defaultAccent, validAccent } from "./theme";
import { useEffect, useState } from "react";

export const zoomLevels = [75, 90, 100, 110, 125, 150, 175] as const;
const defaultZoom = 110;
const storageKey = "tracel.desktop.appearance";
type Appearance = { language: Locale; zoom: number; expanded: boolean; navigationWidth: number; accent: string };
export const navigationMin = 160;
export const navigationMax = 280;
export const navigationDefault = 192;

function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return {
      language: saved?.language === "zh-CN" ? "zh-CN" : "en",
      zoom: zoomLevels.includes(saved?.zoom) ? saved.zoom : defaultZoom,
      expanded: typeof saved?.expanded === "boolean" ? saved.expanded : false,
      accent: validAccent(saved?.accent) ? saved.accent.toLowerCase() : defaultAccent,
      navigationWidth: Number.isFinite(saved?.navigationWidth) ? Math.max(navigationMin, Math.min(navigationMax, saved.navigationWidth)) : navigationDefault,
    };
  } catch { return { language: "en", zoom: defaultZoom, expanded: false, navigationWidth: navigationDefault, accent: defaultAccent }; }
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
    setLanguage: (language: Locale) => setAppearance((current) => ({ ...current, language })),
    setAccent: (accent: string) => {
      if (validAccent(accent)) setAppearance((current) => ({ ...current, accent: accent.toLowerCase() }));
    },
    setZoom: (zoom: number) => {
      if (zoomLevels.some((level) => level === zoom)) setAppearance((current) => ({ ...current, zoom }));
    },
    toggleNavigation: () => setAppearance((current) => ({ ...current, expanded: !current.expanded })),
    setNavigationWidth: (width: number) => setAppearance((current) => ({ ...current, expanded: true, navigationWidth: Math.max(navigationMin, Math.min(navigationMax, Math.round(width))) })),
  };
}
