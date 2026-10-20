"use client";

import { useRef, useState, type ReactNode } from "react";
import { clampRange, MAX_VIEW_SECONDS, type Range, type Capture } from "./model";
import { useI18n, useCaptureTime } from "./i18n";

type Edge = "start" | "end";
const minimumSpan = 2;

/** One coordinate system for moving the viewport and resizing either endpoint. */
export function OverviewViewport({ bounds, view, onView, children, data }: {
  data?: Capture; bounds: Range; view: Range; onView: (view: Range) => void; children: ReactNode;
}) {
  const { t } = useI18n();
  const { clock, dateLabel } = useCaptureTime(data);
  const drag = useRef<{ edge: Edge | null; time: number; view: Range; bounds: Range } | null>(null);
  const [pointerFocus, setPointerFocus] = useState<Edge | "window" | null>(null);
  const total = bounds.end - bounds.start;
  const percent = (time: number) => `${(time - bounds.start) / total * 100}%`;
  const resize = (edge: Edge, time: number, initial = view, limits = bounds) => onView(edge === "start"
    ? { start: Math.max(limits.start, initial.end - MAX_VIEW_SECONDS, Math.min(initial.end - minimumSpan, time)), end: initial.end }
    : { start: initial.start, end: Math.min(limits.end, initial.start + MAX_VIEW_SECONDS, Math.max(initial.start + minimumSpan, time)) });
  const label = (time: number) => `${dateLabel(time)} ${clock(time, true)}`;

  return <div className="tx-overview-plot" role="group" aria-label={t("Overview viewport")}
    onKeyDownCapture={() => setPointerFocus(null)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPointerFocus(null); }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const time = bounds.start + (event.clientX - rect.left) / rect.width * total;
      const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-overview-edge]");
      const edge = handle?.dataset.overviewEdge as Edge | undefined;
      const initial = !edge && (time < view.start || time > view.end)
        ? clampRange({ start: time - (view.end - view.start) / 2, end: time + (view.end - view.start) / 2 }, bounds)
        : view;
      drag.current = { edge: edge ?? null, time, view: initial, bounds };
      (handle ?? event.currentTarget.querySelector<HTMLElement>(".tx-overview-window"))?.focus();
      setPointerFocus(edge ?? "window");
      event.currentTarget.setPointerCapture(event.pointerId);
      if (initial !== view) onView(initial);
    }}
    onPointerMove={(event) => {
      if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const initial = drag.current;
      const time = initial.bounds.start + (event.clientX - rect.left) / rect.width * (initial.bounds.end - initial.bounds.start);
      const delta = time - initial.time;
      if (initial.edge) resize(initial.edge, initial.view[initial.edge] + delta, initial.view, initial.bounds);
      else onView(clampRange({ start: initial.view.start + delta, end: initial.view.end + delta }, initial.bounds));
    }}
    onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onLostPointerCapture={() => { drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}>
    {children}
    <div className="tx-overview-window" role="slider" tabIndex={0} aria-label={t("Overview viewport position")}
      data-pointer-focus={pointerFocus === "window" || undefined}
      aria-valuemin={bounds.start} aria-valuemax={bounds.end - (view.end - view.start)} aria-valuenow={view.start}
      aria-valuetext={`${label(view.start)} — ${label(view.end)}`}
      style={{ left: percent(view.start), width: `${(view.end - view.start) / total * 100}%` }}
      onKeyDown={(event) => {
        const delta = event.key === "ArrowLeft" ? -3600 : event.key === "ArrowRight" ? 3600 : null;
        if (delta === null) return;
        event.preventDefault();
        onView(clampRange({ start: view.start + delta, end: view.end + delta }, bounds));
      }} />
    {(["start", "end"] as const).map((edge) => <div key={edge} data-overview-edge={edge}
      className={`tx-overview-handle tx-overview-handle-${edge}`} role="slider" tabIndex={0}
      data-pointer-focus={pointerFocus === edge || undefined}
      aria-label={t(edge === "start" ? "Overview range start" : "Overview range end")}
      title={t(edge === "start" ? "Drag to adjust range start" : "Drag to adjust range end")}
      aria-valuemin={edge === "start" ? bounds.start : view.start + minimumSpan}
      aria-valuemax={edge === "start" ? view.end - minimumSpan : bounds.end}
      aria-valuenow={view[edge]} aria-valuetext={label(view[edge])}
      style={{ left: percent(view[edge]) }}
      onKeyDown={(event) => {
        const step = Math.max(1, Math.min(3600, (view.end - view.start) / 10));
        const time = event.key === "ArrowLeft" ? view[edge] - step : event.key === "ArrowRight" ? view[edge] + step
          : event.key === "Home" ? bounds.start : event.key === "End" ? bounds.end : null;
        if (time === null) return;
        event.preventDefault();
        resize(edge, time);
      }}><i /></div>)}
  </div>;
}
