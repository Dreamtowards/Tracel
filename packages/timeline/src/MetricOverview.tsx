"use client";

import { useEffect, useMemo, useRef } from "react";
import { OverviewViewport } from "./OverviewViewport";
import { constrainOverviewRange, metricOverviewGeometry } from "./overview";
import { clampRange, getMetricInfo, zoomRange, type Capture, type MetricKey, type Range } from "./model";
import { frameQueue } from "./frameQueue";
import { useI18n } from "./i18n";
import { OverviewCalendar } from "./OverviewCalendar";

/** Uses the same range handles and geometry as the Activity overview. */
export function MetricOverview({ data, metric, view, onView, bounds = data.bounds, onBoundsChange, calendar = false }: {
  data: Capture; metric: MetricKey; view: Range; onView: (view: Range) => void;
  bounds?: Range; onBoundsChange?: (bounds: Range) => void;
  calendar?: boolean;
}) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ bounds, view, archive: data.bounds, onBoundsChange });
  current.current = { bounds, view, archive: data.bounds, onBoundsChange };
  const interactive = !!onBoundsChange;
  useEffect(() => {
    if (!interactive) return;
    const element = host.current!;
    const frames = frameQueue();
    let pending: Range | null = null;
    const wheel = (event: WheelEvent) => {
      if (event.buttons) return;
      event.preventDefault();
      const state = current.current, range = pending ?? state.bounds;
      const rect = element.getBoundingClientRect(), span = range.end - range.start;
      const anchor = range.start + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * span;
      if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const delta = (event.deltaX || event.deltaY) / rect.width * span;
        pending = clampRange({ start: range.start + delta, end: range.end + delta }, state.archive);
      } else pending = zoomRange(range, Math.exp(Math.max(-150, Math.min(150, event.deltaY)) * .004), anchor, state.archive);
      pending = constrainOverviewRange(pending, state.view, state.archive);
      frames.schedule(() => {
        const state = current.current, next = constrainOverviewRange(pending!, state.view, state.archive);
        pending = null;
        state.bounds = next;
        state.onBoundsChange?.(next);
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => { frames.clear(); element.removeEventListener("wheel", wheel); };
  }, [interactive]);
  const geometry = useMemo(() => metricOverviewGeometry(data, metric, 600, bounds), [data, metric, bounds]);
  const info = getMetricInfo(data, metric);
  const plot = <OverviewViewport data={data} bounds={bounds} view={view} onView={onView}>
    <svg viewBox="0 0 1400 44" preserveAspectRatio="none" aria-hidden="true">
      <path d={geometry.area} fill={info.color} opacity=".12" />
      <path d={geometry.line} stroke={info.color} strokeWidth="1.2" fill="none" />
      {geometry.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="1.2" fill={info.color} />)}
    </svg>
  </OverviewViewport>;
  return <div ref={host} tabIndex={interactive ? 0 : undefined} role={interactive ? "group" : undefined}
    aria-label={interactive ? t("Overview time range") : undefined}
    title={interactive && !calendar ? t("Scroll to zoom overview; Shift-scroll to pan") : undefined}
    aria-description={interactive && calendar ? t("Scroll to zoom overview; Shift-scroll to pan") : undefined}
    onKeyDown={event => {
      if (!onBoundsChange || !["+", "=", "-"].includes(event.key)) return;
      event.preventDefault();
      const next = zoomRange(bounds, event.key === "-" ? 1.5 : 1 / 1.5, (bounds.start + bounds.end) / 2, data.bounds);
      onBoundsChange(constrainOverviewRange(next, view, data.bounds));
    }}>
    {calendar ? <OverviewCalendar epoch={data.epoch} bounds={bounds}>{plot}</OverviewCalendar> : plot}
  </div>;
}
