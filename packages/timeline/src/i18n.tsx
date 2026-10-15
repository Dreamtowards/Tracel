"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { dateLabel as formatDate, duration as formatDuration, clock, type Capture } from "./model";
import { timelineZh } from "./messages.zh";

export type Locale = "en" | "zh-CN";
export type Messages = Readonly<Record<string, string>>;
export function translate(locale: Locale, messages: Messages, text: string, values: Record<string, string | number> = {}) {
  const message = locale === "zh-CN" ? messages[text] ?? timelineZh[text] ?? text : text;
  return message.replace(/\{(\w+)\}/g, (placeholder, key: string) => String(values[key] ?? placeholder));
}
function createLocale(locale: Locale, messages: Messages) {
  return {
    locale,
    t: (text: string, values?: Record<string, string | number>) => translate(locale, messages, text, values),
    duration: (seconds: number) => locale === "en" ? formatDuration(seconds) : formatDuration(seconds).replace(/h/g, "小时").replace(/m/g, "分").replace(/s/g, "秒"),
    dateLabel: (seconds: number) => locale === "en" ? formatDate(seconds) : `10月${8 + Math.floor(seconds / 86400)}日`,
  };
}
const noMessages: Messages = {};
const Context = createContext(createLocale("en", noMessages));
export function I18nProvider({ locale, messages = noMessages, children }: { locale: Locale; messages?: Messages; children: ReactNode }) {
  const value = useMemo(() => createLocale(locale, messages), [locale, messages]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useI18n = () => useContext(Context);

/** Real captures use local wall-clock labels; demo formatting stays unchanged. */
export function useCaptureTime(data: Capture | null | undefined) {
  const { locale, dateLabel } = useI18n();
  return useMemo(() => data?.kind === "recorded" ? {
    dateLabel: (seconds: number) => new Date(Date.parse(data.epoch) + seconds * 1000).toLocaleDateString(locale, { month: "short", day: "numeric" }),
    clock: (seconds: number, detailed = false) => new Date(Date.parse(data.epoch) + seconds * 1000).toLocaleTimeString(locale, { hour12: false, hour: "2-digit", minute: "2-digit", ...(detailed ? { second: "2-digit" as const } : {}) }),
  } : {dateLabel,clock}, [data?.epoch,data?.kind,locale,dateLabel]);
}
