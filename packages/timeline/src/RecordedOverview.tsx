"use client";
import { Radio } from "lucide-react";
import { useI18n, useCaptureTime } from "./i18n";
import { OverviewViewport } from "./OverviewViewport";
import { historyOverviewGeometry } from "./overview";
import type { Capture, Range } from "./model";
import type { HistoryControls } from "./history";

export function RecordedOverview({ data, history, label, color, onView }: {
  data: Capture; history: HistoryControls; label: string; color: string; onView: (view: Range, context?: Range) => void;
}) {
  const { t } = useI18n();
  const { clock, dateLabel } = useCaptureTime(data);
  const bounds = history.overviewRange;
  const geometry = historyOverviewGeometry(history.preview?.cpu ?? [], bounds);
  const empty = !data.metrics.length && !data.activity.length && !data.background.length && !data.media.length && !data.afk.length;
  const status = history.loading ? `${t("Loading history in blocks")} · ${history.progress}`
    : empty ? t("No recorded metrics for this day. Enable collection in Settings.")
    : data.detailLevel ? t("Aggregated display · Zoom in for precise intervals. Statistics use original records.") : "";
  return <div className="tx-overview">
    <div className="tx-overview-heading">
      <span><Radio size={12} /> {label}</span>
      <span role="status" className="tx-history-progress" title={status}>{status}</span>
      <span>{dateLabel(bounds.start)} — {dateLabel(bounds.end - 1)} <b>{t("CPU")}</b></span>
    </div>
    <OverviewViewport data={data} bounds={bounds} view={history.view} onView={view => onView(view, bounds)}>
      <svg viewBox="0 0 1400 44" preserveAspectRatio="none" aria-label={t("CPU")} role="img">
        <title>{t("Dots mark isolated CPU samples; gaps have no recorded coverage.")}</title>
        <path d={geometry.area} fill={color} opacity=".1" />
        <path d={geometry.line} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        {geometry.points.map((point, i) => <circle key={i} cx={point.x} cy={point.y} r="1.3" fill={color} />)}
      </svg>
    </OverviewViewport>
    <div className="tx-history-ticks" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => {
      const time = bounds.start + (bounds.end - bounds.start) * i / 6 - (i === 6 ? 1 : 0);
      return <span key={i}>{bounds.end - bounds.start > 2 * 86400 ? dateLabel(time) : clock(time)}</span>;
    })}</div>
  </div>;
}
