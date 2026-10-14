"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, GripHorizontal } from "lucide-react";
import type { TimelineAppearance } from "./DisplaySettings";
import {
  Capture,
  Range,
  MetricKey,
  clampRange,
  zoomRange,
  clock,
  dateLabel,
  duration,
  metricInfo,
  overlap,
  DAY,
} from "./model";

type Track = {
  id: string;
  name: string;
  subtitle?: string;
  height: number;
  baseHeight?: number;
  kind: "group" | "app" | "context" | "background" | "afk" | "metric" | "media";
  keys?: MetricKey[];
  appId?: string;
  group?: string;
};
export type TimelinePalette = {
  background: string; grid: string; divider: string; group: string; focus: string; selection: string;
};
const defaultPalette: TimelinePalette = {
  background: "#101416", grid: "#22292d", divider: "#242b2e", group: "#151a1d", focus: "#bacbbd12", selection: "#d7b17a",
};
type Props = {
  data: Capture;
  view: Range;
  selection: Range | null;
  mode: "select" | "pan";
  focus: string | null;
  appearance: TimelineAppearance;
  palette?: TimelinePalette;
  onView: (r: Range) => void;
  onSelect: (r: Range | null) => void;
  onFocus: (id: string | null) => void;
};
const LABEL = 192;

export function Timeline({
  data,
  view,
  selection,
  mode,
  focus,
  appearance,
  palette = defaultPalette,
  onView,
  onSelect,
  onFocus,
}: Props) {
  const [closed, setClosed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>(["foreground"]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [width, setWidth] = useState(900);
  const host = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    cursor = useRef<HTMLDivElement>(null),
    tip = useRef<HTMLDivElement>(null);
  const state = useRef({ view, mode, onView, onSelect, onFocus, data });
  state.current = { view, mode, onView, onSelect, onFocus, data };
  const drag = useRef<{
    x: number;
    time: number;
    view: Range;
    pan: boolean;
    moved: boolean;
  } | null>(null);
  const tracks = useMemo(() => {
    const all: Track[] = [
      {
        id: "activity",
        name: "ACTIVITY",
        subtitle: "3 tracks",
        height: 32,
        kind: "group",
      },
    ];
    if (!closed.includes("activity")) {
      all.push({
        id: "foreground",
        name: "Foreground app",
        subtitle: "Window in focus",
        height: 34 + appearance.padding * 2,
        kind: "app",
      });
      if (expanded.includes("foreground"))
        all.push({
          id: "context",
          name: "Window context",
          subtitle: "Files · URLs · projects",
          height: 24 + appearance.padding * 2,
          kind: "context",
        });
      all.push({
        id: "background",
        name: "Background apps",
        subtitle: "Running applications",
        height: 26 + appearance.padding * 2,
        kind: "background",
      });
      if (expanded.includes("background"))
        for (const app of data.apps)
          all.push({
            id: `bg-${app.id}`,
            name: app.name,
            appId: app.id,
            height: appearance.backgroundHeight,
            kind: "background",
          });
      all.push({
        id: "afk",
        name: "Idle / AFK",
        height: 18 + appearance.padding * 2,
        kind: "afk",
      });
    }
    all.push({
      id: "performance",
      name: "SYSTEM PERFORMANCE",
      subtitle: "System",
      height: 32,
      kind: "group",
    });
    if (!closed.includes("performance"))
      all.push(
        {
          id: "cpu",
          name: "CPU",
          subtitle: "0 – 100%",
          height: 70,
          kind: "metric",
          keys: ["cpu"],
        },
        {
          id: "ram",
          name: "Memory",
          subtitle: "0 – 32 GB",
          height: 56,
          kind: "metric",
          keys: ["ram"],
        },
        {
          id: "gpu",
          name: "GPU",
          subtitle: "0 – 100%",
          height: 56,
          kind: "metric",
          keys: ["gpu"],
        },
        {
          id: "network",
          name: "Network",
          subtitle: "Receive ━ / Send ┄ · MB/s",
          height: 62,
          kind: "metric",
          keys: ["download", "upload"],
        },
        {
          id: "disk",
          name: "Disk",
          subtitle: "Read ━ / Write ┄ · MB/s",
          height: 62,
          kind: "metric",
          keys: ["read", "write"],
        },
      );
    all.push({
      id: "sound",
      name: "AUDIO & MEDIA",
      subtitle: "2 tracks",
      height: 32,
      kind: "group",
    });
    if (!closed.includes("sound"))
      all.push(
        {
          id: "audio",
          name: "Audio output",
          subtitle: "Output level · %",
          height: 44,
          kind: "metric",
          keys: ["audio"],
        },
        {
          id: "media",
          name: "Now playing",
          subtitle: "Media sessions",
          height: 24 + appearance.padding * 2,
          kind: "media",
        },
      );
    let y = 32;
    return all.map((track) => {
      const height = heights[track.id] ?? track.height;
      const row = { ...track, baseHeight: track.height, height, y };
      y += height;
      return row;
    });
  }, [closed, expanded, heights, data, appearance]);
  const totalHeight = tracks.reduce((s, t) => s + t.height, 32);
  const toggle = (id: string, group: boolean) =>
    (group ? setClosed : setExpanded)((previous) =>
      previous.includes(id)
        ? previous.filter((v) => v !== id)
        : [...previous, id],
    );

  useEffect(() => {
    if (cursor.current) cursor.current.style.display = "none";
    if (tip.current) tip.current.style.display = "none";
  }, [view]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(100, entries[0].contentRect.width - LABEL)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const scale = element.getBoundingClientRect().width / width || 1;
      const dpr = (window.devicePixelRatio || 1) * scale;
      element.width = width * dpr;
      element.height = totalHeight * dpr;
      const ctx = element.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = palette.background;
      ctx.fillRect(0, 0, width, totalHeight);
      const span = view.end - view.start;
      const x = (t: number) => ((t - view.start) / span) * width;
      const rect = (
        r: Range,
        y: number,
        h: number,
        color: string,
        text?: string,
      ) => {
        if (overlap(r, view) <= 0) return;
        const left = Math.max(0, x(r.start)),
          right = Math.min(width, x(r.end));
        ctx.fillStyle = color;
        ctx.fillRect(left, y, Math.max(1, right - left - 1), h);
        if (text && right - left > 48) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(left + 5, y, Math.max(0, right - left - 10), h);
          ctx.clip();
          ctx.fillStyle = "#e3e9ed";
          ctx.font = '11px "Segoe UI", sans-serif';
          ctx.fillText(text, left + 9, y + h / 2 + 4);
          ctx.restore();
        }
      };
      const steps = [
        1,
        2,
        5,
        10,
        15,
        30,
        60,
        120,
        300,
        600,
        900,
        1800,
        3600,
        7200,
        14400,
        21600,
        43200,
        DAY,
        DAY * 2,
      ];
      const step = steps.find((s) => s >= span / (width / 95)) ?? DAY * 2;
      ctx.font = "10px Consolas, monospace";
      for (
        let t = Math.ceil(view.start / step) * step;
        t < view.end;
        t += step
      ) {
        const px = Math.round(x(t)) + 0.5;
        ctx.strokeStyle = palette.grid;
        ctx.beginPath();
        ctx.moveTo(px, 25);
        ctx.lineTo(px, totalHeight);
        ctx.stroke();
        ctx.fillStyle = "#869197";
        ctx.fillText(
          step >= DAY ? dateLabel(t) : clock(t, step < 60),
          px + 6,
          20,
        );
      }
      for (const row of tracks) {
        const { y, height } = row;
        const pad = Math.min(appearance.padding, Math.max(0, (height - 8) / 2));
        ctx.strokeStyle = palette.divider;
        ctx.beginPath();
        ctx.moveTo(0, y + height - 0.5);
        ctx.lineTo(width, y + height - 0.5);
        ctx.stroke();
        if (row.kind === "group") {
          ctx.fillStyle = palette.group;
          ctx.fillRect(0, y, width, height - 1);
          if (row.id === "performance") {
            for (const event of data.events.filter((e) => e.kind !== "sleep"))
              rect(
                event,
                y + 7,
                height - 14,
                palette.focus,
                event.kind === "compile" ? "Shader compile" : "Download",
              );
          }
          continue;
        }
        if (row.kind === "app" || row.kind === "context") {
          const intervals = data.activity.filter((a) => overlap(a, view) > 0);
          // At week scale, pixel buckets merge tiny switches into a dominant app.
          if (span > DAY * 2 && row.kind === "app") {
            for (let px = 0; px < width; px += 4) {
              const bucket = {
                start: view.start + (px / width) * span,
                end: view.start + ((px + 4) / width) * span,
              };
              const event = intervals.reduce<
                (typeof intervals)[number] | undefined
              >(
                (best, a) =>
                  overlap(a, bucket) > (best ? overlap(best, bucket) : 0)
                    ? a
                    : best,
                undefined,
              );
              if (event) {
                ctx.fillStyle =
                  data.apps.find((a) => a.id === event.appId)!.color +
                  (focus && focus !== event.appId ? "33" : "bb");
                ctx.fillRect(px, y + pad, 4, height - pad * 2);
              }
            }
          } else
            for (const event of intervals) {
              const app = data.apps.find((a) => a.id === event.appId)!;
              ctx.globalAlpha = focus && focus !== app.id ? 0.22 : 1;
              if (row.kind === "app") {
                const label =
                  appearance.durationLabels &&
                  x(event.end) - x(event.start) > 130
                    ? `${app.name} · ${duration(event.end - event.start)}`
                    : app.name;
                rect(event, y + pad, height - pad * 2, app.color + "99", label);
                ctx.fillStyle = app.color;
                ctx.fillRect(
                  Math.max(0, x(event.start)),
                  y + pad,
                  Math.max(
                    1,
                    Math.min(width, x(event.end)) -
                      Math.max(0, x(event.start)) -
                      1,
                  ),
                  2,
                );
              } else
                for (const context of event.contexts)
                  rect(
                    context,
                    y + pad,
                    height - pad * 2,
                    app.color +
                      Math.round((appearance.contextOpacity / 100) * 255)
                        .toString(16)
                        .padStart(2, "0"),
                    context.title,
                  );
              ctx.globalAlpha = 1;
            }
        }
        if (row.kind === "background") {
          if (row.appId)
            for (const lifetime of data.background.filter(
              (b) => b.appId === row.appId,
            ))
              rect(
                lifetime,
                y + pad,
                height - pad * 2,
                data.apps.find((a) => a.id === row.appId)!.color + "99",
              );
          else {
            const stripe = (height - pad * 2) / data.apps.length;
            data.apps.forEach((app, index) => {
              const top = y + pad + index * stripe;
              ctx.globalAlpha = focus && focus !== app.id ? 0.25 : 1;
              for (const lifetime of data.background.filter(
                (b) => b.appId === app.id,
              ))
                rect(lifetime, top, Math.max(1, stripe - 1), app.color + "bd");
              for (const event of data.activity.filter(
                (a) => a.appId === app.id,
              ))
                rect(event, top, Math.max(1, stripe - 1), palette.background);
              ctx.globalAlpha = 1;
            });
          }
          // Running lifetimes exclude foreground slices in the expanded rows.
          if (row.appId)
            for (const event of data.activity.filter(
              (a) => a.appId === row.appId,
            ))
              rect(event, y + pad, height - pad * 2, palette.background);
        }
        if (row.kind === "afk")
          for (const event of data.afk)
            rect(event, y + pad, height - pad * 2, "#bba16d77", "AFK");
        if (row.kind === "media")
          for (const event of data.media)
            rect(
              event,
              y + pad,
              height - pad * 2,
              "#6da67f66",
              `♫  ${event.title} · ${event.artist}`,
            );
        if (row.kind === "metric") {
          const from = Math.max(0, Math.floor(view.start / data.samplePeriod)),
            to = Math.min(
              data.metrics.length - 1,
              Math.ceil(view.end / data.samplePeriod),
            );
          for (const [keyIndex, key] of row.keys!.entries()) {
            const info = metricInfo[key];
            const top = y + Math.max(3, pad),
              bottom = y + height - Math.max(2, pad),
              h = bottom - top;
            // One min/max envelope per pixel preserves spikes without drawing every sample.
            const buckets = new Map<
              number,
              { min: number; max: number; last: number }
            >();
            for (let i = from; i <= to; i++) {
              const sample = data.metrics[i];
              if (!sample?.values) continue;
              const left = Math.max(0, Math.floor(x(sample.time))),
                right = Math.min(
                  width - 1,
                  Math.floor(x(sample.time + data.samplePeriod)),
                );
              for (let px = left; px <= right; px++) {
                const value = sample.values[key],
                  old = buckets.get(px);
                buckets.set(px, {
                  min: Math.min(old?.min ?? value, value),
                  max: Math.max(old?.max ?? value, value),
                  last: value,
                });
              }
            }
            ctx.fillStyle = info.color + (keyIndex ? "10" : "16");
            ctx.strokeStyle = info.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const [px, bucket] of buckets) {
              ctx.fillRect(
                px,
                bottom - (bucket.max / info.max) * h,
                1,
                (bucket.max / info.max) * h,
              );
              ctx.moveTo(px, bottom - (bucket.min / info.max) * h);
              ctx.lineTo(px, bottom - (bucket.max / info.max) * h);
            }
            ctx.globalAlpha = 0.35;
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.setLineDash(key === "write" || key === "upload" ? [5, 4] : []);
            ctx.beginPath();
            let previous = -2;
            for (const [px, bucket] of buckets) {
              const py = bottom - (bucket.last / info.max) * h;
              if (px !== previous + 1) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
              previous = px;
            }
            ctx.stroke();
            ctx.setLineDash([]);
          }
          const scale = metricInfo[row.keys![0]];
          ctx.font = "9px Consolas, monospace";
          ctx.textAlign = "right";
          ctx.fillStyle = "#839198";
          ctx.fillText(`${scale.max} ${scale.unit}`, width - 7, y + 13);
          ctx.textAlign = "left";
        }
      }
      if (selection && overlap(selection, view) > 0) {
        const left = Math.max(0, x(selection.start)),
          right = Math.min(width, x(selection.end));
        ctx.fillStyle = `${palette.selection}12`;
        ctx.fillRect(left, 32, right - left, totalHeight - 32);
        ctx.strokeStyle = palette.selection;
        ctx.setLineDash([3, 3]);
        for (const edge of [selection.start, selection.end])
          if (edge >= view.start && edge <= view.end) {
            ctx.beginPath();
            ctx.moveTo(x(edge), 30);
            ctx.lineTo(x(edge), totalHeight);
            ctx.stroke();
          }
        ctx.setLineDash([]);
        ctx.fillStyle = palette.selection;
        ctx.font = "10px Consolas, monospace";
        ctx.fillText(duration(selection.end - selection.start), left + 5, 44);
      }
    };
    const frame = requestAnimationFrame(draw);
    window.addEventListener("resize", draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", draw);
    };
  }, [data, view, selection, tracks, width, totalHeight, focus, appearance, palette]);

  useEffect(() => {
    const element = canvas.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view, onView, data } = state.current;
      const rect = element.getBoundingClientRect();
      const anchor =
        view.start +
        ((e.clientX - rect.left) / rect.width) * (view.end - view.start);
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta =
          ((e.deltaX || e.deltaY) / rect.width) * (view.end - view.start);
        onView(
          clampRange(
            { start: view.start + delta, end: view.end + delta },
            data.bounds,
          ),
        );
      } else
        onView(
          zoomRange(
            view,
            Math.exp(Math.max(-150, Math.min(150, e.deltaY)) * 0.004),
            anchor,
            data.bounds,
          ),
        );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  function inspect(clientX: number, clientY: number) {
    const rect = canvas.current!.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const time = view.start + (px / rect.width) * (view.end - view.start);
    const localX = px * width / rect.width;
    const localY = (clientY - rect.top) * totalHeight / rect.height;
    const row = tracks.find(
      (t) => localY >= t.y && localY < t.y + t.height,
    );
    const event = data.activity.find((a) => a.start <= time && a.end > time);
    if (tip.current) tip.current.style.display = "none";
    if (cursor.current) {
      cursor.current.style.display = "block";
      cursor.current.style.left = `${LABEL + localX}px`;
      cursor.current.dataset.time = `${dateLabel(time)} · ${clock(time, true)}`;
    }
    if (tip.current && !drag.current && row && row.kind !== "group") {
      const sample = data.metrics[Math.floor(time / data.samplePeriod)];
      let lines = `${dateLabel(time)} · ${clock(time, true)}\n${row.name}`;
      if ((row.kind === "app" || row.kind === "context") && event) {
        const app = data.apps.find((a) => a.id === event.appId)!;
        const context = event.contexts.find(
          (c) => c.start <= time && c.end > time,
        );
        const interval = row.kind === "context" && context ? context : event;
        lines = `${duration(interval.end - interval.start)}  ·  ${app.name}\n${dateLabel(interval.start)} · ${clock(interval.start, true)} — ${clock(interval.end, true)}\n${event.windowTitle}\n${app.exe}\n${context?.value ?? ""}`;
      } else if (row.keys)
        lines +=
          "\n" +
          row.keys
            .map(
              (key) =>
                `${metricInfo[key].name}: ${sample?.values ? sample.values[key].toFixed(1) + " " + metricInfo[key].unit : "No sample · asleep / capture gap"}`,
            )
            .join("\n");
      else if (row.kind === "media") {
        const media = data.media.find((m) => m.start <= time && m.end > time);
        lines += media
          ? `\n${media.title}\n${media.artist}\n${data.apps.find((a) => a.id === media.appId)?.name} · ${media.state}`
          : "\nNo media session";
      } else if (row.kind === "afk")
        lines +=
          "\n" +
          (data.afk.find((a) => a.start <= time && a.end > time)?.reason ??
            "Not idle");
      else if (row.kind === "background")
        lines +=
          "\n" +
          (data.background
            .filter(
              (b) =>
                b.start <= time && b.end > time && b.appId !== event?.appId,
            )
            .map((b) => data.apps.find((a) => a.id === b.appId)!.name)
            .join(", ") || "No background apps");
      else lines += "\nNo foreground activity";
      tip.current.textContent = lines;
      tip.current.style.display = "block";
      tip.current.style.left = `${Math.max(8, Math.min(window.innerWidth - 354, clientX + 18))}px`;
      tip.current.style.top = `${Math.max(8, Math.min(window.innerHeight - 155, clientY + 20))}px`;
    }
    return { time, event, row };
  }
  return (
    <div className="tx-timeline-scroll">
      <div ref={host} className="tx-timeline" style={{ height: totalHeight }}>
        <div className="tx-axis-label">
          TRACKS <span>UTC+08:00</span>
        </div>
        {tracks.map((row) => (
          <div
            key={row.id}
            className={`tx-track-label ${row.kind === "group" ? "tx-group" : ""}`}
            style={{ top: row.y, height: row.height }}
          >
            <button
              onClick={() =>
                row.kind === "group" ||
                row.id === "foreground" ||
                row.id === "background"
                  ? toggle(row.id, row.kind === "group")
                  : setHeights((h) => {
                      const next = { ...h };
                      if (row.height > row.baseHeight!) delete next[row.id];
                      else next[row.id] = 110;
                      return next;
                    })
              }
              aria-expanded={
                row.kind === "group"
                  ? !closed.includes(row.id)
                  : expanded.includes(row.id)
              }
            >
              {row.kind === "group" ? (
                closed.includes(row.id) ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )
              ) : row.id === "foreground" || row.id === "background" ? (
                expanded.includes(row.id) ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )
              ) : (
                <i
                  style={{
                    background: row.keys
                      ? metricInfo[row.keys[0]].color
                      : (data.apps.find((app) => app.id === row.appId)?.color ??
                        "#78868c"),
                  }}
                />
              )}
              <span>
                {row.name}
                {row.subtitle && row.height >= 38 && (
                  <small>{row.subtitle}</small>
                )}
              </span>
            </button>
            {row.kind !== "group" && (
              <div
                className="tx-track-resize"
                role="separator"
                aria-label={`Resize ${row.name}`}
                aria-orientation="horizontal"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    setHeights((h) => ({
                      ...h,
                      [row.id]: Math.max(
                        row.appId ? 16 : 24,
                        Math.min(
                          180,
                          row.height + (e.key === "ArrowDown" ? 10 : -10),
                        ),
                      ),
                    }));
                  }
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  e.currentTarget.dataset.start = `${e.clientY}`;
                  e.currentTarget.dataset.height = `${row.height}`;
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  // React clears currentTarget after dispatch; snapshot before the updater.
                  const height = Math.max(
                    row.appId ? 16 : 24,
                    Math.min(
                      180,
                      Number(e.currentTarget.dataset.height) +
                        (e.clientY - Number(e.currentTarget.dataset.start)) /
                          (host.current!.getBoundingClientRect().width / host.current!.offsetWidth),
                    ),
                  );
                  setHeights((h) => ({
                    ...h,
                    [row.id]: height,
                  }));
                }}
              >
                <GripHorizontal size={12} />
              </div>
            )}
          </div>
        ))}
        <canvas
          ref={canvas}
          style={{
            marginLeft: LABEL,
            width,
            height: totalHeight,
            cursor: mode === "pan" ? "grab" : "crosshair",
          }}
          tabIndex={0}
          aria-label="Interactive timeline. Scroll to zoom, Shift-scroll to pan. Drag to select; Alt-drag to pan. Arrow keys pan; plus and minus zoom; Escape clears selection."
          onKeyDown={(e) => {
            const span = view.end - view.start;
            if (
              ["ArrowLeft", "ArrowRight", "+", "=", "-", "Escape"].includes(
                e.key,
              )
            )
              e.preventDefault();
            if (e.key === "Escape") onSelect(null);
            if (["+", "=", "-"].includes(e.key))
              onView(
                zoomRange(
                  view,
                  e.key === "-" ? 1.5 : 1 / 1.5,
                  (view.start + view.end) / 2,
                  data.bounds,
                ),
              );
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              const delta = span * (e.key === "ArrowLeft" ? -0.15 : 0.15);
              onView(
                clampRange(
                  { start: view.start + delta, end: view.end + delta },
                  data.bounds,
                ),
              );
            }
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 && e.button !== 1) return;
            e.preventDefault();
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            const result = inspect(e.clientX, e.clientY);
            drag.current = {
              x: e.clientX,
              time: result.time,
              view,
              pan: mode === "pan" || e.altKey || e.button === 1,
              moved: false,
            };
            if (tip.current) tip.current.style.display = "none";
          }}
          onPointerMove={(e) => {
            const current = drag.current;
            if (current) {
              if (Math.abs(e.clientX - current.x) > 3) current.moved = true;
              if (!current.moved) return;
              const delta =
                ((e.clientX - current.x) / e.currentTarget.getBoundingClientRect().width) *
                (current.view.end - current.view.start);
              if (current.pan)
                onView(
                  clampRange(
                    {
                      start: current.view.start - delta,
                      end: current.view.end - delta,
                    },
                    data.bounds,
                  ),
                );
              else {
                const end = Math.max(
                  data.bounds.start,
                  Math.min(data.bounds.end, current.time + delta),
                );
                if (Math.abs(end - current.time) < 0.001) return;
                onSelect({
                  start: Math.min(current.time, end),
                  end: Math.max(current.time, end),
                });
              }
            } else inspect(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            const current = drag.current;
            drag.current = null;
            if (current && !current.moved) {
              const result = inspect(e.clientX, e.clientY);
              if (
                result.event &&
                (result.row?.kind === "app" || result.row?.kind === "context")
              )
                onFocus(
                  focus === result.event.appId ? null : result.event.appId,
                );
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerLeave={() => {
            if (cursor.current) cursor.current.style.display = "none";
            if (tip.current) tip.current.style.display = "none";
          }}
        />
        <div ref={cursor} className="tx-hover-cursor" />
        {typeof document !== "undefined" &&
          createPortal(<div ref={tip} className="tx-tooltip" />, document.body)}
      </div>
    </div>
  );
}
