"use client";

import { useMemo, useState } from "react";
import { useRadarStore } from "@/radar/store";
import { rankVisitors, type RankingDimension } from "@/radar/analytics";

const dimensions: { value: RankingDimension; label: string }[] = [
  { value: "country", label: "Countries" },
  { value: "city", label: "Cities" },
  { value: "browser", label: "Browsers" },
  { value: "source", label: "Sources" },
  { value: "page", label: "Pages" },
];

export function AudienceRankings() {
  const visitors = useRadarStore((state) => state.visitors);
  const [dimension, setDimension] = useState<RankingDimension>("country");
  const rows = useMemo(
    () => rankVisitors(Object.values(visitors), dimension),
    [visitors, dimension],
  );
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <section className="audience-panel" aria-labelledby="audience-heading">
      <div className="insight-heading">
        <h2 id="audience-heading">Audience</h2>
        <span className="audience-scope">
          {total} current visitors <span>· online + idle</span>
        </span>
      </div>
      <div
        className="ranking-tabs"
        role="tablist"
        aria-label="Visitor ranking dimension"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const index = dimensions.findIndex(
              (item) => item.value === dimension,
            );
            const next =
              dimensions[
                (index +
                  (event.key === "ArrowRight" ? 1 : dimensions.length - 1)) %
                  dimensions.length
              ];
            setDimension(next.value);
            (
              event.currentTarget.querySelector(
                `#rank-${next.value}`,
              ) as HTMLElement
            )?.focus();
          }
        }}
      >
        {dimensions.map((item) => (
          <button
            key={item.value}
            id={`rank-${item.value}`}
            role="tab"
            aria-selected={dimension === item.value}
            aria-controls="ranking-content"
            tabIndex={dimension === item.value ? 0 : -1}
            onClick={() => setDimension(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="ranking-content"
        aria-labelledby={`rank-${dimension}`}
        className="ranking-content"
      >
        <ol className="ranking-list">
          {rows.slice(0, 5).map((row, i) => (
            <li key={`${row.detail}:${row.name}`}>
              <span className="ranking-position mono">{i + 1}</span>
              <div className="ranking-name">
                <span title={row.name}>
                  {row.detail && <small>{row.detail}</small>}
                  {row.name}
                </span>
                <div className="ranking-track">
                  <i style={{ width: `${row.percentage}%` }} />
                </div>
              </div>
              <strong className="mono">{row.count}</strong>
              <span className="ranking-share mono">
                {row.percentage.toFixed(0)}%
              </span>
            </li>
          ))}
        </ol>
        {!rows.length && <p className="ranking-empty">No visitors online</p>}
        {rows.length > 5 && (
          <span className="ranking-remainder">
            {rows.length - 5} more{" "}
            {dimensions
              .find((item) => item.value === dimension)
              ?.label.toLowerCase()}{" "}
            · {rows.slice(5).reduce((sum, row) => sum + row.count, 0)} visitors
          </span>
        )}
      </div>
    </section>
  );
}
