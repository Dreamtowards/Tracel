import { useI18n } from "./i18n";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";

export type TimelineAppearance = {
  padding: number;
  backgroundHeight: number;
  contextOpacity: number;
  durationLabels: boolean;
  currentTime: boolean;
};
export const defaultAppearance: TimelineAppearance = {
  padding: 3,
  backgroundHeight: 16,
  contextOpacity: 72,
  durationLabels: true,
  currentTime: true,
};

export function DisplaySettings({
  value,
  categoryColors,
  onCategoryColors,
  onChange,
  onClose,
}: {
  value: TimelineAppearance;
  categoryColors?: boolean;
  onCategoryColors?: (value: boolean) => void;
  onChange: (value: TimelineAppearance) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <section
      className="tx-display-settings"
      aria-label={t("Timeline display settings")}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <header>
        <span>
          <SlidersHorizontal size={15} /> {" "}{t("Timeline appearance")}</span>
        <button
          className="tx-icon-button"
          aria-label={t("Close display settings")}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>
      <p>{t("Less space. More context. Changes apply immediately.")}</p>
      <label>
        {t("Lane vertical padding")}{" "}<output>{value.padding} px</output>
        <input
          aria-label={t("Lane vertical padding")}
          type="range"
          min={0}
          max={12}
          value={value.padding}
          onChange={(e) =>
            onChange({ ...value, padding: Number(e.target.value) })
          }
        />
        <small>{t("Applied above and below each lane’s content.")}</small>
      </label>
      <label>
        {t("App row height")}{" "}<output>{value.backgroundHeight} px</output>
        <input
          aria-label={t("App row height")}
          type="range"
          min={14}
          max={32}
          step={2}
          value={value.backgroundHeight}
          onChange={(e) =>
            onChange({ ...value, backgroundHeight: Number(e.target.value) })
          }
        />
      </label>
      <label>
        {t("Context brightness")}{" "}<output>{value.contextOpacity}%</output>
        <input
          aria-label={t("Context brightness")}
          type="range"
          min={35}
          max={100}
          value={value.contextOpacity}
          onChange={(e) =>
            onChange({ ...value, contextOpacity: Number(e.target.value) })
          }
        />
      </label>
      <label className="tx-setting-check">
        <span>
          {t("Show duration in app lanes")}<small>{t("When there is enough horizontal space.")}</small>
        </span>
        <input
          type="checkbox"
          checked={value.durationLabels}
          onChange={(e) =>
            onChange({ ...value, durationLabels: e.target.checked })
          }
        />
      </label>
      <label className="tx-setting-check">
        <span>{t("Show current time")}</span>
        <input type="checkbox" checked={value.currentTime} onChange={(e) => onChange({ ...value, currentTime: e.target.checked })} />
      </label>
      {categoryColors !== undefined && <label className="tx-setting-check">
        <span>{t("Color apps by category")}</span>
        <input type="checkbox" checked={categoryColors} onChange={event => onCategoryColors?.(event.target.checked)} />
      </label>}
      <footer>
        <button
          className="tx-text-button"
          onClick={() => { onChange(defaultAppearance); onCategoryColors?.(false); }}
        >
          <RotateCcw size={12} /> {" "}{t("Reset defaults")}</button>
        <span>{t("Session preferences")}</span>
      </footer>
    </section>
  );
}
