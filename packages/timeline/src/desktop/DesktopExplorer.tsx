import { useLayoutEffect, useMemo, type ComponentProps } from "react";
import Explorer from "../Explorer";
import DatePicker from "./DatePicker";
import { accentForeground } from "./theme";
import type { Locale } from "../i18n";

export function useDesktopTheme(accent: string, zoom: number, locale: Locale) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const oldLanguage = root.lang;
    const keys = ["--primary", "--primary-foreground", "--ui-scale"];
    const old = keys.map(key => root.style.getPropertyValue(key));
    root.lang = locale;
    root.style.setProperty(keys[0], accent);
    root.style.setProperty(keys[1], accentForeground(accent));
    root.style.setProperty(keys[2], String(zoom / 100));
    return () => {
      root.lang = oldLanguage;
      keys.forEach((key, index) => old[index] ? root.style.setProperty(key, old[index]) : root.style.removeProperty(key));
    };
  }, [accent, zoom, locale]);
}

/** The actual Desktop timeline composition; hosts supply data and native capabilities. */
export function DesktopExplorer({ accent, ...props }: ComponentProps<typeof Explorer> & { accent: string }) {
  const palette = useMemo(() => ({ background: "#111113", grid: "#232326", divider: "#29292d", group: "#19191c", focus: `${accent}12`, selection: accent, text: "#ececef", muted: "#a1a1aa" }), [accent]);
  return <Explorer headerVariant="hidden" compact renderDatePicker={props => <DatePicker {...props} />} palette={palette} {...props} />;
}
