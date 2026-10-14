"use client";

import { useRef, type ReactNode } from "react";
import { clampRange, clock, type Range } from "./model";
import { useI18n } from "./i18n";

type Edge = "start" | "end";
const minimumSpan = 2;

/** One coordinate system for moving the viewport and resizing either endpoint. */
export function OverviewViewport({ bounds, view, onView, children }: {
  bounds: Range; view: Range; onView: (view: Range) => void; children: ReactNode;
}) {
  const { t, dateLabel } = useI18n();
  const drag = useRef<{ edge: Edge | null; time: number; view: Range } | null>(null);
  const total = bounds.end - bounds.start;
  const percent = (time: number) => `${(time - bounds.start) / total * 100}%`;
  const resize = (edge: Edge, time: number, initial = view) => onView(edge === "start"
    ? { start: Math.max(bounds.start, Math.min(initial.end - minimumSpan, time)), end: initial.end }
    : { start: initial.start, end: Math.min(bounds.end, Math.max(initial.start + minimumSpan, time)) });
  const label = (time: number) => `${dateLabel(time)} ${clock(time, true)}`;

  return <div className="tx-overview-plot" role="group" aria-label={t("Overview viewport")}
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
      drag.current = { edge: edge ?? null, time, view: initial };
      (handle ?? event.currentTarget.querySelector<HTMLElement>(".tx-overview-window"))?.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (initial !== view) onView(initial);
    }}
    onPointerMove={(event) => {
      if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const time = bounds.start + (event.clientX - rect.left) / rect.width * total;
      const initial = drag.current;
      const delta = time - initial.time;
      if (initial.edge) resize(initial.edge, initial.view[initial.edge] + delta, initial.view);
      else onView(clampRange({ start: initial.view.start + delta, end: initial.view.end + delta }, bounds));
    }}
    onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onLostPointerCapture={() => { drag.current = null; }}
    onPointerCancel={() => { drag.current = null; }}>
    {children}
    <div className="tx-overview-window" role="slider" tabIndex={0} aria-label={t("Overview viewport position")}
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
