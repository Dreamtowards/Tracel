import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import type { Range } from "./model";

/** A separate overlay updates the clock without repainting all metric tracks. */
export function CurrentTimeLine({ epoch, view, labelWidth, width }: {
  epoch: string; view: Range; labelWidth: number; width: number;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const time = (now - Date.parse(epoch)) / 1000;
  if (!Number.isFinite(time) || time < view.start || time >= view.end) return null;
  return <div className="tx-current-time" role="img" aria-label={t("Current time")}
    style={{ left: labelWidth + width * (time - view.start) / (view.end - view.start) }} />;
}
