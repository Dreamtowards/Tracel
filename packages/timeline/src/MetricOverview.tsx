"use client";

import { useMemo } from "react";
import { OverviewViewport } from "./OverviewViewport";
import { metricOverviewGeometry } from "./overview";
import { getMetricInfo, type Capture, type MetricKey, type Range } from "./model";

/** Uses the same range handles and geometry as the Activity overview. */
export function MetricOverview({ data, metric, view, onView }: {
  data: Capture; metric: MetricKey; view: Range; onView: (view: Range) => void;
}) {
  const geometry = useMemo(() => metricOverviewGeometry(data, metric), [data, metric]);
  const info = getMetricInfo(data, metric);
  return <OverviewViewport data={data} bounds={data.bounds} view={view} onView={onView}>
    <svg viewBox="0 0 1400 44" preserveAspectRatio="none" aria-hidden="true">
      <path d={geometry.area} fill={info.color} opacity=".12" />
      <path d={geometry.line} stroke={info.color} strokeWidth="1.2" fill="none" />
      {geometry.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="1.2" fill={info.color} />)}
    </svg>
  </OverviewViewport>;
}
