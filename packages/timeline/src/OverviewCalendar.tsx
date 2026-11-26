"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { frameQueue } from "./frameQueue";
import { overviewCalendarTicks } from "./overview";
import { useI18n } from "./i18n";
import type { Range } from "./model";

/** Calendar grid, sparse labels and pointer date share the overview's range. */
export function OverviewCalendar({ epoch, bounds, children }: { epoch: string; bounds: Range; children: ReactNode }) {
  const { locale } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [tooltipWidth, setTooltipWidth] = useState(0);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const frames = useMemo(frameQueue, []);
  useEffect(() => {
    const element = host.current!;
    const resize = new ResizeObserver(() => setWidth(element.getBoundingClientRect().width));
    setWidth(element.getBoundingClientRect().width);
    resize.observe(element);
    return () => { resize.disconnect(); frames.clear(); };
  }, [frames]);
  const { ticks, labels } = useMemo(() => overviewCalendarTicks(epoch, bounds, width), [epoch, bounds, width]);
  const origin = Date.parse(epoch);
  const date = (time: number) => new Date(origin + time * 1000);
  const fullDate = (time: number) => date(time).toLocaleString(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const hoverTime = hover === null ? null : bounds.start + hover * (bounds.end - bounds.start);
  const hoverLabel = hoverTime === null ? "" : fullDate(hoverTime);
  useLayoutEffect(() => {
    if (tooltip.current) setTooltipWidth(tooltip.current.getBoundingClientRect().width);
  }, [hoverLabel]);
  return <div ref={host} className="tx-overview-calendar"
    onPointerMove={event => {
      if (event.pointerType === "touch") return;
      const rect = event.currentTarget.querySelector(".tx-overview-plot")!.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom) { frames.clear(); setHover(null); return; }
      const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      frames.schedule(() => setHover(position));
    }}
    onPointerLeave={() => { frames.clear(); setHover(null); }}>
    <div className="tx-overview-calendar-grid" aria-hidden="true">{ticks.map(tick => <i key={tick.time} className={tick.week ? "tx-overview-week" : "tx-overview-day"} style={{ left: `${tick.position * 100}%` }} />)}</div>
    {children}
    <div className="tx-overview-calendar-labels" aria-hidden="true">{labels.map(label => {
      const value = date(label.time);
      return <time key={label.time} dateTime={value.toISOString()} title={fullDate(label.time)} style={{ left: `${label.position * 100}%`, transform: label.position * width < 24 ? "none" : label.position * width > width - 24 ? "translateX(-100%)" : undefined }}>{value.getMonth() + 1}.{value.getDate()}</time>;
    })}</div>
    {hover !== null && hoverTime !== null && <div className="tx-overview-calendar-hover" style={{ left: `${hover * 100}%` }}>
      <span ref={tooltip} role="tooltip" style={{ left: Math.max(0, Math.min(width - tooltipWidth, hover * width - tooltipWidth / 2)) - hover * width }}>{hoverLabel}</span>
    </div>}
  </div>;
}
