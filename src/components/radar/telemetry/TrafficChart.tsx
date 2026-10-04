"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRadarStore } from "@/radar/store";
import { BUCKET_MS, trafficSeries } from "@/radar/analytics";
import { time } from "@/radar/format";

const LEFT = 30,
  RIGHT = 12,
  TOP = 10,
  BOTTOM = 24;

export function TrafficChart() {
  const plot = useRef<HTMLDivElement>(null);
  const [H, setPlotHeight] = useState(186);
  const [W, setPlotWidth] = useState(760);
  useEffect(() => {
    if (!plot.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setPlotWidth(Math.max(280, entry.contentRect.width));
      setPlotHeight(Math.max(120, entry.contentRect.height));
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);
  const now = useRadarStore((state) => state.now);
  const records = useRadarStore((state) => state.trafficRecords);
  const visitors = useRadarStore((state) => state.visitors);
  const paused = useRadarStore((state) => state.paused);
  const [windowMs, setWindowMs] = useState(300000);
  const [hover, setHover] = useState<number | null>(null);
  const [showViews, setShowViews] = useState(true);
  const [showVisitors, setShowVisitors] = useState(true);
  const active = Object.values(visitors).filter(
    (visitor) => visitor.status !== "offline",
  ).length;
  const series = useMemo(
    () => trafficSeries(records, active, now, windowMs),
    [records, active, now, windowMs],
  );
  const max = Math.max(
    4,
    ...series.map((bucket) =>
      Math.max(
        showViews ? bucket.pageViews : 0,
        showVisitors ? bucket.visitors : 0,
      ),
    ),
  );
  const ceiling = Math.ceil(max / 4) * 4;
  const width = W - LEFT - RIGHT,
    height = H - TOP - BOTTOM;
  const x = (index: number) =>
    LEFT + ((index + 0.5) * width) / Math.max(1, series.length);
  const y = (value: number) => TOP + height - (value / ceiling) * height;
  const linePath = (field: "pageViews" | "visitors") =>
    series
      .map(
        (bucket, index) =>
          `${index ? "L" : "M"}${x(index)},${y(bucket[field])}`,
      )
      .join(" ");
  const selected = hover !== null ? series[hover] : undefined;
  const views = series.reduce((sum, bucket) => sum + bucket.pageViews, 0);
  return (
    <section className="traffic-panel" aria-labelledby="traffic-heading">
      <div className="insight-heading">
        <h2 id="traffic-heading">
          Traffic <span className={`status-dot ${paused ? "paused" : ""}`} />
        </h2>
        <div className="chart-summary">
          <strong>{active}</strong>
          <span>online</span>
          <i />
          <strong>{views}</strong>
          <span>page views</span>
        </div>
        <div className="range-switch" aria-label="Traffic time range">
          {[300000, 600000].map((value) => (
            <button
              key={value}
              aria-pressed={windowMs === value}
              onClick={() => {
                setWindowMs(value);
                setHover(null);
              }}
            >
              {value / 60000}m
            </button>
          ))}
        </div>
      </div>
      <div className="chart-legend">
        <button
          aria-pressed={showViews}
          onClick={() => setShowViews(!showViews)}
        >
          <i className="views-key" />
          Page views / 15s
        </button>
        <button
          aria-pressed={showVisitors}
          onClick={() => setShowVisitors(!showVisitors)}
        >
          <i className="visitors-key" />
          Online visitors
        </button>
        <span>UTC · simulated time</span>
      </div>
      <div
        className="traffic-plot"
        ref={plot}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label={`Traffic over the last ${windowMs / 60000} minutes: ${views} page views, ${active} visitors currently online. Page views are totals per 15 seconds; visitors include online and idle sessions.`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="views-fill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--tracel-live)"
                stopOpacity=".09"
              />
              <stop offset="100%" stopColor="#79d8bd" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="visitors-fill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--tracel-info)"
                stopOpacity=".07"
              />
              <stop offset="100%" stopColor="#6f9fbe" stopOpacity="0" />
            </linearGradient>
          </defs>
          {showViews && series.length > 0 && (
            <path
              d={
                linePath("pageViews") +
                ` L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
              }
              fill="url(#views-fill)"
            />
          )}
          {showVisitors && series.length > 0 && (
            <path
              d={
                linePath("visitors") +
                ` L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
              }
              fill="url(#visitors-fill)"
            />
          )}
          {Array.from({ length: 5 }, (_, i) => (
            <g key={i}>
              <line
                x1={LEFT}
                x2={W - RIGHT}
                y1={y((ceiling * i) / 4)}
                y2={y((ceiling * i) / 4)}
                className="chart-grid"
              />
              <text
                x={LEFT - 9}
                y={y((ceiling * i) / 4) + 3}
                textAnchor="end"
                className="chart-axis"
              >
                {(ceiling * i) / 4}
              </text>
            </g>
          ))}
          {showViews && series.length > 0 && (
            <path
              d={linePath("pageViews")}
              className="chart-line chart-views-line"
            />
          )}
          {showVisitors && series.length > 0 && (
            <path d={linePath("visitors")} className="chart-line" />
          )}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => {
            const index = Math.round((series.length - 1) * fraction);
            const bucket = series[index];
            return bucket ? (
              <text
                key={i}
                x={x(index)}
                y={H - 4}
                textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
                className="chart-axis"
              >
                {time(Math.min(bucket.timestamp + BUCKET_MS, now)).slice(0, 5)}
              </text>
            ) : null;
          })}
          {selected && (
            <>
              <line
                x1={x(hover!)}
                x2={x(hover!)}
                y1={TOP}
                y2={H - BOTTOM}
                className="chart-crosshair"
              />
              {showViews && (
                <circle
                  cx={x(hover!)}
                  cy={y(selected.pageViews)}
                  r="3"
                  className="chart-current-dot chart-views-dot"
                />
              )}
              {showVisitors && (
                <circle
                  cx={x(hover!)}
                  cy={y(selected.visitors)}
                  r="3"
                  className="chart-current-dot"
                />
              )}
            </>
          )}
          {series.map((bucket, index) => (
            <rect
              key={`hit-${bucket.timestamp}`}
              x={LEFT + (index * width) / series.length}
              y={TOP}
              width={width / series.length}
              height={height}
              fill="transparent"
              tabIndex={index === (hover ?? 0) ? 0 : -1}
              role="button"
              aria-label={`${time(bucket.timestamp)}: ${bucket.pageViews} page views, ${bucket.visitors} online visitors`}
              onPointerEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const next = Math.max(
                    0,
                    Math.min(
                      series.length - 1,
                      index + (event.key === "ArrowRight" ? 1 : -1),
                    ),
                  );
                  (
                    event.currentTarget.parentElement?.querySelectorAll(
                      '[role="button"]',
                    )[next] as SVGElement
                  )?.focus();
                }
              }}
            />
          ))}
        </svg>
        {selected && (
          <div
            className="chart-tooltip"
            style={{
              left: `${Math.max(0, Math.min(W - 180, x(hover!) - 80))}px`,
            }}
          >
            <time>
              {time(selected.timestamp)} –{" "}
              {time(Math.min(selected.timestamp + BUCKET_MS, now))}
            </time>
            <span>
              <i className="views-key" />
              {selected.pageViews} page views
            </span>
            <span>
              <i className="visitors-key" />
              {selected.visitors} online visitors
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
